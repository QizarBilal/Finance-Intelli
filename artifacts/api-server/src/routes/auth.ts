import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { profileTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, verifyToken } from "../middleware/auth";

const router = Router();

// POST /api/auth/register — first-time account creation
router.post("/auth/register", async (req, res) => {
  try {
    const { username, password, full_name, ...rest } = req.body;
    if (!username || !password || !full_name) {
      return res.status(400).json({ error: "username, password and full_name are required" });
    }

    // Check username taken
    const existing = await db.select().from(profileTable).where(eq(profileTable.username, username)).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: "Username already taken" });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const [profile] = await db.insert(profileTable).values({
      username,
      password_hash,
      full_name,
      currency: rest.currency ?? "INR",
      occupation: rest.occupation ?? null,
      company: rest.company ?? null,
      income_type: rest.income_type ?? null,
      country: rest.country ?? null,
      state: rest.state ?? null,
      monthly_income: rest.monthly_income != null ? String(rest.monthly_income) : null,
      salary_frequency: rest.salary_frequency ?? null,
      monthly_goal: rest.monthly_goal != null ? String(rest.monthly_goal) : null,
      weekly_savings_goal: rest.weekly_savings_goal != null ? String(rest.weekly_savings_goal) : null,
      emergency_fund_goal: rest.emergency_fund_goal != null ? String(rest.emergency_fund_goal) : null,
      theme: rest.theme ?? "dark",
      week_start_day: rest.week_start_day ?? "Monday",
    }).returning();

    const token = signToken({ profileId: profile.id, username: profile.username! });
    const { password_hash: _, ...safeProfile } = profile;
    return res.status(201).json({ token, profile: safeProfile });
  } catch (err) {
    req.log.error({ err }, "Failed to register");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/login
router.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }

    const [profile] = await db.select().from(profileTable).where(eq(profileTable.username, username)).limit(1);
    if (!profile || !profile.password_hash) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const valid = await bcrypt.compare(password, profile.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid username or password" });

    const token = signToken({ profileId: profile.id, username: profile.username! });
    const { password_hash: _, ...safeProfile } = profile;
    return res.json({ token, profile: safeProfile });
  } catch (err) {
    req.log.error({ err }, "Failed to login");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/auth/me — validate token and return profile
router.get("/auth/me", async (req, res) => {
  try {
    const header = req.headers["authorization"];
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "No token" });

    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ error: "Invalid token" });

    const [profile] = await db.select().from(profileTable).where(eq(profileTable.id, payload.profileId)).limit(1);
    if (!profile) return res.status(404).json({ error: "Profile not found" });

    const { password_hash: _, ...safeProfile } = profile;
    return res.json(safeProfile);
  } catch (err) {
    req.log.error({ err }, "Failed /auth/me");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
