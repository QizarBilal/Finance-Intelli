import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { logger } from "../lib/logger";

const JWT_SECRET = process.env.SESSION_SECRET ?? "finance-intelli-secret-key";

export interface AuthPayload {
  userId: number;
  username: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function signToken(payload: AuthPayload, rememberMe = true): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: rememberMe ? "365d" : "24h",
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.user = payload;
    next();
  } catch (err) {
    logger.warn({ err }, "Invalid JWT token");
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
