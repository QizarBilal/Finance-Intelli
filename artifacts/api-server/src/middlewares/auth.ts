import { createHash, randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, sessionsTable } from "@workspace/db";
import { logger } from "../lib/logger";

const configuredSecret = process.env.SESSION_SECRET;
if (!configuredSecret || configuredSecret.length < 32) {
  throw new Error("SESSION_SECRET is required and must contain at least 32 characters.");
}
const JWT_SECRET: string = configuredSecret;

const ACCESS_COOKIE = "fi_access";
const REFRESH_COOKIE = "fi_refresh";
const secure = process.env.NODE_ENV === "production";

export interface AuthPayload {
  userId: number;
  username: string;
  sessionId?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

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
  const expiresAt = new Date(Date.now() + (rememberMe ? 30 : 1) * 24 * 60 * 60 * 1000);
  const [session] = await db.insert(sessionsTable).values({
    profileId: user.id,
    tokenHash: hashToken(refreshToken),
    userAgent: req.get("user-agent")?.slice(0, 500) ?? null,
    ipAddress: req.ip,
    expiresAt,
  }).returning({ id: sessionsTable.id });
  const accessToken = signToken({ userId: user.id, username: user.username, sessionId: session.id });
  res.cookie(ACCESS_COOKIE, accessToken, { ...cookieOptions(), maxAge: 15 * 60 * 1000 });
  res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieOptions(), maxAge: expiresAt.getTime() - Date.now() });
  return session.id;
}

export async function rotateSession(req: Request, res: Response): Promise<AuthPayload | null> {
  const refreshToken = req.cookies?.[REFRESH_COOKIE];
  if (!refreshToken) return null;
  const [session] = await db.select().from(sessionsTable).where(and(
    eq(sessionsTable.tokenHash, hashToken(refreshToken)),
    isNull(sessionsTable.revokedAt),
    gt(sessionsTable.expiresAt, new Date()),
  )).limit(1);
  if (!session) return null;
  const nextRefresh = randomBytes(48).toString("base64url");
  await db.update(sessionsTable).set({ tokenHash: hashToken(nextRefresh), lastUsedAt: new Date() })
    .where(eq(sessionsTable.id, session.id));
  const payload = { userId: session.profileId, username: "", sessionId: session.id };
  res.cookie(ACCESS_COOKIE, signToken(payload), { ...cookieOptions(), maxAge: 15 * 60 * 1000 });
  res.cookie(REFRESH_COOKIE, nextRefresh, { ...cookieOptions(), maxAge: session.expiresAt.getTime() - Date.now() });
  return payload;
}

export async function revokeSession(req: Request, res: Response): Promise<void> {
  const refreshToken = req.cookies?.[REFRESH_COOKIE];
  if (refreshToken) {
    await db.update(sessionsTable).set({ revokedAt: new Date() })
      .where(eq(sessionsTable.tokenHash, hashToken(refreshToken)));
  }
  res.clearCookie(ACCESS_COOKIE, cookieOptions());
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : req.cookies?.[ACCESS_COOKIE];
  if (!token) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    req.user = jwt.verify(token, JWT_SECRET, {
      issuer: "finance-intelli", audience: "finance-intelli-web",
    }) as unknown as AuthPayload;
    next();
  } catch (err) {
    logger.warn({ err }, "Invalid access token");
    res.status(401).json({ error: "Session expired", code: "SESSION_EXPIRED" });
  }
}
