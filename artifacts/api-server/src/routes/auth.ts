import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, profileTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, requireAuth } from "../middlewares/auth";
import {
  SetupProfileBody,
  LoginBody,
  UpdateProfileBody,
  ChangePasswordBody,
} from "@workspace/api-zod";

const router = Router();

// Auth check — always true (multi-user signup supported)
router.get("/auth/check", async (_req, res): Promise<void> => {
  res.json({ exists: true });
});

// Register / create account
router.post("/auth/setup", async (req, res): Promise<void> => {
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

  const token = signToken({ userId: profile.id, username: profile.username }, true);

  res.status(201).json({
    token,
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
      photo: profile.photo,
      createdAt: profile.createdAt.toISOString(),
    },
  });
});

// Login
router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, password, rememberMe } = parsed.data;
  const [profile] = await db.select().from(profileTable).where(eq(profileTable.username, username)).limit(1);

  if (!profile) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const valid = await bcrypt.compare(password, profile.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const token = signToken({ userId: profile.id, username: profile.username }, rememberMe ?? true);

  res.json({
    token,
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
      photo: profile.photo,
      createdAt: profile.createdAt.toISOString(),
    },
  });
});

// Logout (stateless JWT — just acknowledge)
router.post("/auth/logout", (_req, res): void => {
  res.json({ message: "Logged out successfully" });
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
    photo: profile.photo,
    createdAt: profile.createdAt.toISOString(),
  });
});

// Change password
router.patch("/auth/password", requireAuth, async (req, res): Promise<void> => {
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

  res.json({ message: "Password changed successfully" });
});

export default router;
