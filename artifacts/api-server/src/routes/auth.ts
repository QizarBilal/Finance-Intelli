import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcryptjs";
import { db, profileTable, sessionsTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { issueSession, requireAuth, revokeSession, rotateSession } from "../middlewares/auth";
import { ensureDefaultAccount } from "../lib/accounts";
import { writeAudit } from "../lib/audit";
import {
  SetupProfileBody,
  LoginBody,
  UpdateProfileBody,
  ChangePasswordBody,
} from "@workspace/api-zod";

const router = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60_000, limit: 10, skipSuccessfulRequests: true,
  standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "Too many authentication attempts. Please wait before retrying." },
});

// Auth check — always true (multi-user signup supported)
router.get("/auth/check", async (_req, res): Promise<void> => {
  res.json({ exists: true });
});

// Register / create account
router.post("/auth/setup", authLimiter, async (req, res): Promise<void> => {
  const parsed = SetupProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, password, name, occupation, jobStatus, incomeType, country, state, currency, currencySymbol, theme, weekStarts, salaryFrequency } = parsed.data;

  // Check username uniqueness
  const [existing] = await db.select({ id: profileTable.id }).from(profileTable).where(eq(profileTable.username, username)).limit(1);
  if (existing) {
    res.status(409).json({ error: "Username already taken. Please choose another." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [profile] = await db.insert(profileTable).values({
    username,
    passwordHash,
    name,
    occupation: occupation ?? null,
    jobStatus: jobStatus ?? null,
    incomeType: incomeType ?? null,
    country: country ?? null,
    state: state ?? null,
    currency: currency ?? "INR",
    currencySymbol: currencySymbol ?? "₹",
    theme: theme ?? "dark",
    weekStarts: weekStarts ?? "monday",
    salaryFrequency: salaryFrequency ?? null,
  }).returning();

  await ensureDefaultAccount(profile.id, profile.currency);
  await issueSession(req, res, profile, true);

  res.status(201).json({
    token: "cookie-session",
    profile: {
      id: profile.id,
      username: profile.username,
      name: profile.name,
      occupation: profile.occupation,
      jobStatus: profile.jobStatus,
      incomeType: profile.incomeType,
      country: profile.country,
      state: profile.state,
      currency: profile.currency,
      currencySymbol: profile.currencySymbol,
      theme: profile.theme,
      weekStarts: profile.weekStarts,
      salaryFrequency: profile.salaryFrequency,
      timezone: profile.timezone,
      locale: profile.locale,
      photo: profile.photo,
      createdAt: profile.createdAt.toISOString(),
    },
  });
});

// Login
router.post("/auth/login", authLimiter, async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, password, rememberMe } = parsed.data;
  const [profile] = await db.select().from(profileTable).where(eq(profileTable.username, username)).limit(1);

  if (!profile || (profile.lockedUntil && profile.lockedUntil > new Date())) {
    await bcrypt.compare(password, "$2b$12$wrr4AiR78lM1kfeBavt8EuMkFiwQfGgK5u8oNO9hFYRVohNrwlhpS");
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const valid = await bcrypt.compare(password, profile.passwordHash);
  if (!valid) {
    const failures = profile.failedLoginCount + 1;
    await db.update(profileTable).set({
      failedLoginCount: failures,
      lockedUntil: failures >= 5 ? new Date(Date.now() + Math.min(30, 2 ** (failures - 5)) * 60_000) : null,
    }).where(eq(profileTable.id, profile.id));
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  await db.update(profileTable).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(profileTable.id, profile.id));
  await issueSession(req, res, profile, rememberMe ?? true);
  await writeAudit(req, "login", "session", null, null, { username: profile.username });

  res.json({
    token: "cookie-session",
    profile: {
      id: profile.id,
      username: profile.username,
      name: profile.name,
      occupation: profile.occupation,
      jobStatus: profile.jobStatus,
      incomeType: profile.incomeType,
      country: profile.country,
      state: profile.state,
      currency: profile.currency,
      currencySymbol: profile.currencySymbol,
      theme: profile.theme,
      weekStarts: profile.weekStarts,
      salaryFrequency: profile.salaryFrequency,
      timezone: profile.timezone,
      locale: profile.locale,
      photo: profile.photo,
      createdAt: profile.createdAt.toISOString(),
    },
  });
});

// Logout (stateless JWT — just acknowledge)
router.post("/auth/logout", async (req, res): Promise<void> => {
  await revokeSession(req, res);
  res.json({ message: "Logged out successfully" });
});

router.post("/auth/refresh", async (req, res): Promise<void> => {
  const payload = await rotateSession(req, res);
  if (!payload) { res.status(401).json({ error: "Session expired" }); return; }
  res.json({ ok: true });
});

router.get("/auth/sessions", requireAuth, async (req, res): Promise<void> => {
  const sessions = await db.select({
    id: sessionsTable.id, userAgent: sessionsTable.userAgent, ipAddress: sessionsTable.ipAddress,
    lastUsedAt: sessionsTable.lastUsedAt, expiresAt: sessionsTable.expiresAt, createdAt: sessionsTable.createdAt,
  }).from(sessionsTable).where(and(
    eq(sessionsTable.profileId, req.user!.userId),
    isNull(sessionsTable.revokedAt),
  )).orderBy(sessionsTable.createdAt);
  res.json(sessions.map(session => ({ ...session, current: session.id === req.user!.sessionId })));
});

router.delete("/auth/sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [session] = await db.update(sessionsTable).set({ revokedAt: new Date() }).where(and(
    eq(sessionsTable.id, id), eq(sessionsTable.profileId, req.user!.userId),
  )).returning();
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  await writeAudit(req, "revoke", "session", id);
  res.sendStatus(204);
});

// Get current user
router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [profile] = await db.select().from(profileTable).where(eq(profileTable.id, req.user!.userId)).limit(1);
  if (!profile) {
    res.status(401).json({ error: "Profile not found" });
    return;
  }
  res.json({
    id: profile.id,
    username: profile.username,
    name: profile.name,
    occupation: profile.occupation,
    jobStatus: profile.jobStatus,
    incomeType: profile.incomeType,
    country: profile.country,
    state: profile.state,
    currency: profile.currency,
    currencySymbol: profile.currencySymbol,
    theme: profile.theme,
    weekStarts: profile.weekStarts,
    salaryFrequency: profile.salaryFrequency,
    timezone: profile.timezone,
    locale: profile.locale,
    photo: profile.photo,
    createdAt: profile.createdAt.toISOString(),
  });
});

// Update profile
router.patch("/auth/profile", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = {};
  const data = parsed.data;
  if (data.name != null) updates.name = data.name;
  if (data.occupation != null) updates.occupation = data.occupation;
  if (data.jobStatus != null) updates.jobStatus = data.jobStatus;
  if (data.incomeType != null) updates.incomeType = data.incomeType;
  if (data.country != null) updates.country = data.country;
  if (data.state != null) updates.state = data.state;
  if (data.currency != null) updates.currency = data.currency;
  if (data.currencySymbol != null) updates.currencySymbol = data.currencySymbol;
  if (data.theme != null) updates.theme = data.theme;
  if (data.weekStarts != null) updates.weekStarts = data.weekStarts;
  if (data.salaryFrequency != null) updates.salaryFrequency = data.salaryFrequency;
  if (typeof req.body.timezone === "string") {
    try { Intl.DateTimeFormat(undefined, { timeZone: req.body.timezone }); updates.timezone = req.body.timezone; }
    catch { res.status(400).json({ error: "Invalid IANA time zone" }); return; }
  }
  if (typeof req.body.locale === "string") updates.locale = req.body.locale.slice(0, 20);
  if (data.photo != null) updates.photo = data.photo;

  const [profile] = await db.update(profileTable).set(updates).where(eq(profileTable.id, req.user!.userId)).returning();

  res.json({
    id: profile.id,
    username: profile.username,
    name: profile.name,
    occupation: profile.occupation,
    jobStatus: profile.jobStatus,
    incomeType: profile.incomeType,
    country: profile.country,
    state: profile.state,
    currency: profile.currency,
    currencySymbol: profile.currencySymbol,
    theme: profile.theme,
    weekStarts: profile.weekStarts,
    salaryFrequency: profile.salaryFrequency,
    timezone: profile.timezone,
    locale: profile.locale,
    photo: profile.photo,
    createdAt: profile.createdAt.toISOString(),
  });
});

// Change password
router.patch("/auth/password", authLimiter, requireAuth, async (req, res): Promise<void> => {
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { currentPassword, newPassword } = parsed.data;
  const [profile] = await db.select().from(profileTable).where(eq(profileTable.id, req.user!.userId)).limit(1);

  const valid = await bcrypt.compare(currentPassword, profile.passwordHash);
  if (!valid) {
    res.status(400).json({ error: "Current password is incorrect" });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.update(profileTable).set({ passwordHash }).where(eq(profileTable.id, req.user!.userId));
  await db.update(sessionsTable).set({ revokedAt: new Date() })
    .where(eq(sessionsTable.profileId, req.user!.userId));
  await issueSession(req, res, profile, true);
  await writeAudit(req, "change_password", "profile", profile.id);

  res.json({ message: "Password changed successfully" });
});

export default router;
