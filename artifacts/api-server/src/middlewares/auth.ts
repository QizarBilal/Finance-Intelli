import { createHash, randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { collections, getCollection, nextId, withoutMongoId } from "@workspace/db";
import { logger } from "../lib/logger";

const configuredSecret = process.env.SESSION_SECRET;
if (!configuredSecret || configuredSecret.length < 32) {
  throw new Error("SESSION_SECRET is required and must contain at least 32 characters.");
}
const JWT_SECRET: string = configuredSecret;
const ACCESS_COOKIE = "fi_access";
const REFRESH_COOKIE = "fi_refresh";
const secure = process.env.NODE_ENV === "production";

export interface AuthPayload { userId: number; username: string; sessionId?: number }
declare global { namespace Express { interface Request { user?: AuthPayload } } }

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "15m", issuer: "finance-intelli", audience: "finance-intelli-web" });
}
function cookieOptions(httpOnly = true) {
  return { httpOnly, secure, sameSite: "lax" as const, path: "/" };
}

export async function issueSession(req: Request, res: Response, user: { id: number; username: string }, rememberMe = true) {
  const refreshToken = randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + (rememberMe ? 30 : 1) * 86_400_000);
  const sessions = await getCollection(collections.sessions);
  const session = {
    id: await nextId(collections.sessions), profileId: user.id, tokenHash: hashToken(refreshToken),
    userAgent: req.get("user-agent")?.slice(0, 500) ?? null, ipAddress: req.ip,
    expiresAt, lastUsedAt: null, revokedAt: null, createdAt: new Date(), updatedAt: new Date(),
  };
  await sessions.insertOne(session);
  const accessToken = signToken({ userId: user.id, username: user.username, sessionId: session.id });
  res.cookie(ACCESS_COOKIE, accessToken, { ...cookieOptions(), maxAge: 900_000 });
  res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieOptions(), maxAge: expiresAt.getTime() - Date.now() });
  return session.id;
}

export async function rotateSession(req: Request, res: Response): Promise<AuthPayload | null> {
  const refreshToken = req.cookies?.[REFRESH_COOKIE];
  if (!refreshToken) return null;
  const sessions = await getCollection(collections.sessions);
  const session = withoutMongoId(await sessions.findOne({
    tokenHash: hashToken(refreshToken), revokedAt: null, expiresAt: { $gt: new Date() },
  })) as any;
  if (!session) return null;
  const nextRefresh = randomBytes(48).toString("base64url");
  await sessions.updateOne({ id: session.id }, { $set: { tokenHash: hashToken(nextRefresh), lastUsedAt: new Date(), updatedAt: new Date() } });
  const payload = { userId: session.profileId, username: "", sessionId: session.id };
  res.cookie(ACCESS_COOKIE, signToken(payload), { ...cookieOptions(), maxAge: 900_000 });
  res.cookie(REFRESH_COOKIE, nextRefresh, { ...cookieOptions(), maxAge: new Date(session.expiresAt).getTime() - Date.now() });
  return payload;
}

export async function revokeSession(req: Request, res: Response): Promise<void> {
  const refreshToken = req.cookies?.[REFRESH_COOKIE];
  if (refreshToken) {
    const sessions = await getCollection(collections.sessions);
    await sessions.updateOne({ tokenHash: hashToken(refreshToken) }, { $set: { revokedAt: new Date(), updatedAt: new Date() } });
  }
  res.clearCookie(ACCESS_COOKIE, cookieOptions());
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : req.cookies?.[ACCESS_COOKIE];
  if (!token) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    req.user = jwt.verify(token, JWT_SECRET, { issuer: "finance-intelli", audience: "finance-intelli-web" }) as unknown as AuthPayload;
    next();
  } catch (err) {
    logger.warn({ err }, "Invalid access token");
    res.status(401).json({ error: "Session expired", code: "SESSION_EXPIRED" });
  }
}
