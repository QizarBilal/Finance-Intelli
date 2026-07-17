import { Router } from "express";
import { db } from "@workspace/db";
import { transactionsTable, categoriesTable, remindersTable } from "@workspace/db";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";

const router = Router();

function todayStr() { return new Date().toISOString().split("T")[0]; }
function weekRange() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(now); mon.setDate(diff);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { start: mon.toISOString().split("T")[0], end: sun.toISOString().split("T")[0] };
}
function monthRange() {
  const now = new Date();
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start, end: endDate.toISOString().split("T")[0] };
}
function prevMonthRange() {
  const now = new Date();
  const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const m = now.getMonth() === 0 ? 12 : now.getMonth();
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const endDate = new Date(y, m, 0);
  return { start, end: endDate.toISOString().split("T")[0] };
}

async function sumByType(start: string, end: string, type: string): Promise<number> {
  const rows = await db.select({ total: sql<string>`COALESCE(SUM(amount::numeric), 0)` })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.type, type), gte(transactionsTable.date, start), lte(transactionsTable.date, end)));
  return Number(rows[0]?.total ?? 0);
}

router.get("/dashboard", async (req, res) => {
  try {
    const today = todayStr();
    const week = weekRange();
    const month = monthRange();
    const prevMonth = prevMonthRange();

    // Parallel queries
    const [
      todayIncome, todayExpenses,
      weekIncome, weekExpenses,
      monthIncome, monthExpenses,
      prevMonthIncome, prevMonthExpenses,
    ] = await Promise.all([
      sumByType(today, today, "income"),
      sumByType(today, today, "expense"),
      sumByType(week.start, week.end, "income"),
      sumByType(week.start, week.end, "expense"),
      sumByType(month.start, month.end, "income"),
      sumByType(month.start, month.end, "expense"),
      sumByType(prevMonth.start, prevMonth.end, "income"),
      sumByType(prevMonth.start, prevMonth.end, "expense"),
    ]);

    // Largest expense this month
    const largestExpRows = await db.select({
      amount: transactionsTable.amount,
      category_id: transactionsTable.category_id,
    }).from(transactionsTable)
      .where(and(eq(transactionsTable.type, "expense"), gte(transactionsTable.date, month.start), lte(transactionsTable.date, month.end)))
      .orderBy(desc(sql`amount::numeric`)).limit(1);

    let largestExpCat: string | null = null;
    if (largestExpRows[0]?.category_id) {
      const cats = await db.select().from(categoriesTable).where(eq(categoriesTable.id, largestExpRows[0].category_id)).limit(1);
      largestExpCat = cats[0]?.name ?? null;
    }

    // Upcoming bills
    const futureDate = new Date(); futureDate.setDate(futureDate.getDate() + 30);
    const upcomingBills = await db.select().from(remindersTable)
      .where(and(gte(remindersTable.due_date, today), lte(remindersTable.due_date, futureDate.toISOString().split("T")[0]), eq(remindersTable.is_paid, false)));

    // Group transactions by date
    const allTxns = await db.select({ date: transactionsTable.date, type: transactionsTable.type, amount: transactionsTable.amount })
      .from(transactionsTable).orderBy(desc(transactionsTable.date));

    const byDate: Record<string, { inc: number; exp: number }> = {};
    for (const t of allTxns) {
      if (!byDate[t.date]) byDate[t.date] = { inc: 0, exp: 0 };
      if (t.type === "income") byDate[t.date].inc += Number(t.amount);
      else byDate[t.date].exp += Number(t.amount);
    }

    // No spend days this month
    let noSpendDays = 0;
    const [mYear, mMonth] = month.start.split("-").map(Number);
    const [tYear, tMonth, tDay] = today.split("-").map(Number);
    for (let d = 1; d <= tDay; d++) {
      const ds = `${mYear}-${String(mMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (!byDate[ds] || byDate[ds].exp === 0) noSpendDays++;
    }

    // Streak from today backwards — max 365 day lookback, skip empty days
    let savingsStreak = 0;
    const datesWithActivity = Object.keys(byDate).sort().reverse();
    let streakBroken = false;
    for (const ds of datesWithActivity) {
      if (streakBroken) break;
      if (ds > today) continue;
      const day = byDate[ds];
      if (day.inc >= day.exp && day.inc > 0) savingsStreak++;
      else if (day.exp > 0) { streakBroken = true; }
      if (savingsStreak >= 365) break;
    }

    const monthSavings = monthIncome - monthExpenses;
    const savingsRate = monthIncome > 0 ? Math.round((monthSavings / monthIncome) * 100) : 0;

    // Projected month end
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const dayOfMonth = new Date().getDate();
    const projectedExpenses = dayOfMonth > 0 ? (monthExpenses / dayOfMonth) * daysInMonth : monthExpenses;
    const projectedSavings = monthIncome - projectedExpenses;

    // Financial health score (0-100)
    let score = 50;
    if (savingsRate >= 20) score += 20;
    else if (savingsRate >= 10) score += 10;
    if (monthExpenses <= monthIncome) score += 15;
    if (savingsStreak >= 7) score += 10;
    if (noSpendDays >= 5) score += 5;
    score = Math.min(100, Math.max(0, score));

    const incomeGrowth = prevMonthIncome > 0 ? ((monthIncome - prevMonthIncome) / prevMonthIncome) * 100 : 0;
    const expenseGrowth = prevMonthExpenses > 0 ? ((monthExpenses - prevMonthExpenses) / prevMonthExpenses) * 100 : 0;

    const upcomingBillsAmount = upcomingBills.reduce((s, b) => s + (b.amount ? Number(b.amount) : 0), 0);

    return res.json({
      today: { income: todayIncome, expenses: todayExpenses, savings: todayIncome - todayExpenses },
      this_week: { income: weekIncome, expenses: weekExpenses, savings: weekIncome - weekExpenses },
      this_month: { income: monthIncome, expenses: monthExpenses, savings: monthSavings },
      net_worth: monthIncome - monthExpenses,
      available_cash: monthIncome - monthExpenses,
      savings_rate: savingsRate,
      financial_health_score: score,
      projected_month_end_savings: projectedSavings,
      savings_streak_days: savingsStreak,
      no_spend_days: noSpendDays,
      largest_expense_this_month: largestExpRows[0] ? Number(largestExpRows[0].amount) : null,
      largest_expense_category: largestExpCat,
      remaining_daily_budget: null,
      remaining_monthly_budget: monthIncome > 0 ? Math.max(0, monthIncome - monthExpenses) : null,
      income_growth_percent: Math.round(incomeGrowth * 10) / 10,
      expense_growth_percent: Math.round(expenseGrowth * 10) / 10,
      upcoming_bills_count: upcomingBills.length,
      upcoming_bills_amount: upcomingBillsAmount,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get dashboard");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/dashboard/recent-transactions", async (req, res) => {
  try {
    const limit = Number(req.query.limit ?? 10);
    const rows = await db.select().from(transactionsTable)
      .orderBy(desc(transactionsTable.date), desc(transactionsTable.created_at))
      .limit(limit);

    const enriched = await Promise.all(rows.map(async t => {
      const cats = await db.select().from(categoriesTable).where(eq(categoriesTable.id, t.category_id)).limit(1);
      const cat = cats[0];
      return {
        ...t,
        amount: Number(t.amount),
        category_name: cat?.name ?? null,
        category_color: cat?.color ?? null,
        category_icon: cat?.icon ?? null,
        created_at: t.created_at.toISOString(),
      };
    }));

    return res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "Failed to get recent transactions");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
