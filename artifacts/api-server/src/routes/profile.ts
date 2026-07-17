import { Router } from "express";
import { db } from "@workspace/db";
import { profileTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/profile", async (req, res) => {
  try {
    const profiles = await db.select().from(profileTable).limit(1);
    if (profiles.length === 0) {
      return res.status(404).json({ error: "Profile not found" });
    }
    const p = profiles[0];
    return res.json({
      ...p,
      monthly_income: p.monthly_income ? Number(p.monthly_income) : null,
      monthly_goal: p.monthly_goal ? Number(p.monthly_goal) : null,
      weekly_savings_goal: p.weekly_savings_goal ? Number(p.weekly_savings_goal) : null,
      emergency_fund_goal: p.emergency_fund_goal ? Number(p.emergency_fund_goal) : null,
      created_at: p.created_at.toISOString(),
      updated_at: p.updated_at.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get profile");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/profile", async (req, res) => {
  try {
    const body = req.body;
    const existing = await db.select().from(profileTable).limit(1);
    const now = new Date();
    const data = {
      full_name: body.full_name,
      occupation: body.occupation ?? null,
      company: body.company ?? null,
      job_status: body.job_status ?? null,
      income_type: body.income_type ?? null,
      currency: body.currency ?? "INR",
      country: body.country ?? null,
      state: body.state ?? null,
      city: body.city ?? null,
      monthly_income: body.monthly_income != null ? String(body.monthly_income) : null,
      salary_frequency: body.salary_frequency ?? null,
      monthly_goal: body.monthly_goal != null ? String(body.monthly_goal) : null,
      weekly_savings_goal: body.weekly_savings_goal != null ? String(body.weekly_savings_goal) : null,
      emergency_fund_goal: body.emergency_fund_goal != null ? String(body.emergency_fund_goal) : null,
      week_start_day: body.week_start_day ?? "Monday",
      theme: body.theme ?? "dark",
      date_format: body.date_format ?? "DD/MM/YYYY",
      avatar_url: body.avatar_url ?? null,
      notification_preferences: body.notification_preferences ?? null,
      updated_at: now,
    };

    let profile;
    if (existing.length === 0) {
      const inserted = await db.insert(profileTable).values({ ...data, created_at: now }).returning();
      profile = inserted[0];
    } else {
      const updated = await db.update(profileTable).set(data).where(eq(profileTable.id, existing[0].id)).returning();
      profile = updated[0];
    }

    return res.json({
      ...profile,
      monthly_income: profile.monthly_income ? Number(profile.monthly_income) : null,
      monthly_goal: profile.monthly_goal ? Number(profile.monthly_goal) : null,
      weekly_savings_goal: profile.weekly_savings_goal ? Number(profile.weekly_savings_goal) : null,
      emergency_fund_goal: profile.emergency_fund_goal ? Number(profile.emergency_fund_goal) : null,
      created_at: profile.created_at.toISOString(),
      updated_at: profile.updated_at.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to update profile");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
