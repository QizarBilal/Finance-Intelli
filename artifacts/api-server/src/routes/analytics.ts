import { Router } from "express";
import { db } from "@workspace/db";
import { transactionsTable, categoriesTable } from "@workspace/db";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";

const router = Router();

function padDate(y: number, m: number, d = 1) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// GET /analytics/trends
router.get("/analytics/trends", async (req, res) => {
  try {
    const period = (req.query.period as string) || "monthly";
    const months = Number(req.query.months ?? 6);
    const now = new Date();
    const labels: string[] = [];
    const income: number[] = [];
    const expenses: number[] = [];
    const savings: number[] = [];

    if (period === "monthly") {
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const start = padDate(d.getFullYear(), d.getMonth() + 1);
        const end = padDate(d.getFullYear(), d.getMonth() + 2, 0); // last day
        const fixedEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0];
        const rows = await db.select({ type: transactionsTable.type, total: sql<string>`COALESCE(SUM(amount::numeric), 0)` })
          .from(transactionsTable)
          .where(and(gte(transactionsTable.date, start), lte(transactionsTable.date, fixedEnd)))
          .groupBy(transactionsTable.type);
        const inc = Number(rows.find(r => r.type === "income")?.total ?? 0);
        const exp = Number(rows.find(r => r.type === "expense")?.total ?? 0);
        labels.push(d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }));
        income.push(inc);
        expenses.push(exp);
        savings.push(inc - exp);
      }
    } else if (period === "weekly") {
      for (let i = 7; i >= 0; i--) {
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - i * 7 - weekStart.getDay() + 1);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        const start = weekStart.toISOString().split("T")[0];
        const end = weekEnd.toISOString().split("T")[0];
        const rows = await db.select({ type: transactionsTable.type, total: sql<string>`COALESCE(SUM(amount::numeric), 0)` })
          .from(transactionsTable)
          .where(and(gte(transactionsTable.date, start), lte(transactionsTable.date, end)))
          .groupBy(transactionsTable.type);
        const inc = Number(rows.find(r => r.type === "income")?.total ?? 0);
        const exp = Number(rows.find(r => r.type === "expense")?.total ?? 0);
        labels.push(`W${8 - i}`);
        income.push(inc);
        expenses.push(exp);
        savings.push(inc - exp);
      }
    } else {
      // yearly - last 3 years
      for (let i = 2; i >= 0; i--) {
        const year = now.getFullYear() - i;
        const rows = await db.select({ type: transactionsTable.type, total: sql<string>`COALESCE(SUM(amount::numeric), 0)` })
          .from(transactionsTable)
          .where(and(gte(transactionsTable.date, `${year}-01-01`), lte(transactionsTable.date, `${year}-12-31`)))
          .groupBy(transactionsTable.type);
        const inc = Number(rows.find(r => r.type === "income")?.total ?? 0);
        const exp = Number(rows.find(r => r.type === "expense")?.total ?? 0);
        labels.push(String(year));
        income.push(inc);
        expenses.push(exp);
        savings.push(inc - exp);
      }
    }

    return res.json({ labels, income, expenses, savings });
  } catch (err) {
    req.log.error({ err }, "Failed to get trends");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /analytics/category-breakdown
router.get("/analytics/category-breakdown", async (req, res) => {
  try {
    const type = (req.query.type as string) || "expense";
    const now = new Date();
    const start_date = (req.query.start_date as string) || padDate(now.getFullYear(), now.getMonth() + 1);
    const end_date = (req.query.end_date as string) || now.toISOString().split("T")[0];

    const rows = await db.select({
      category_id: transactionsTable.category_id,
      total: sql<string>`COALESCE(SUM(amount::numeric), 0)`,
      count: sql<string>`COUNT(*)`,
    }).from(transactionsTable)
      .where(and(eq(transactionsTable.type, type), gte(transactionsTable.date, start_date), lte(transactionsTable.date, end_date)))
      .groupBy(transactionsTable.category_id);

    const grandTotal = rows.reduce((s, r) => s + Number(r.total), 0);
    const result = await Promise.all(rows.map(async r => {
      const cats = await db.select().from(categoriesTable).where(eq(categoriesTable.id, r.category_id)).limit(1);
      const cat = cats[0];
      return {
        category_id: r.category_id,
        category_name: cat?.name ?? "Unknown",
        category_color: cat?.color ?? null,
        category_icon: cat?.icon ?? null,
        amount: Number(r.total),
        percent: grandTotal > 0 ? Math.round((Number(r.total) / grandTotal) * 100) : 0,
        transaction_count: Number(r.count),
      };
    }));

    result.sort((a, b) => b.amount - a.amount);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get category breakdown");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /analytics/heatmap
router.get("/analytics/heatmap", async (req, res) => {
  try {
    const now = new Date();
    const year = Number(req.query.year ?? now.getFullYear());
    const month = req.query.month ? Number(req.query.month) : undefined;

    const start = month ? padDate(year, month) : `${year}-01-01`;
    const end = month ? new Date(year, month, 0).toISOString().split("T")[0] : `${year}-12-31`;

    const rows = await db.select({
      date: transactionsTable.date,
      total: sql<string>`COALESCE(SUM(CASE WHEN type='expense' THEN amount::numeric ELSE 0 END), 0)`,
    }).from(transactionsTable)
      .where(and(gte(transactionsTable.date, start), lte(transactionsTable.date, end)))
      .groupBy(transactionsTable.date);

    const amounts = rows.map(r => Number(r.total));
    const maxAmount = Math.max(...amounts, 1);

    const result = rows.map(r => {
      const amount = Number(r.total);
      const level = amount === 0 ? 0 : Math.ceil((amount / maxAmount) * 4);
      return { date: r.date, amount, level };
    });
    result.sort((a, b) => a.date.localeCompare(b.date));
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get heatmap");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /analytics/insights
router.get("/analytics/insights", async (req, res) => {
  try {
    const now = new Date();
    const monthStart = padDate(now.getFullYear(), now.getMonth() + 1);
    const today = now.toISOString().split("T")[0];
    const prevMonthY = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const prevMonthM = now.getMonth() === 0 ? 12 : now.getMonth();
    const prevStart = padDate(prevMonthY, prevMonthM);
    const prevEnd = new Date(prevMonthY, prevMonthM, 0).toISOString().split("T")[0];

    const [monthRows, prevRows, catRows] = await Promise.all([
      db.select({ type: transactionsTable.type, total: sql<string>`COALESCE(SUM(amount::numeric), 0)` })
        .from(transactionsTable).where(and(gte(transactionsTable.date, monthStart), lte(transactionsTable.date, today))).groupBy(transactionsTable.type),
      db.select({ type: transactionsTable.type, total: sql<string>`COALESCE(SUM(amount::numeric), 0)` })
        .from(transactionsTable).where(and(gte(transactionsTable.date, prevStart), lte(transactionsTable.date, prevEnd))).groupBy(transactionsTable.type),
      db.select({ category_id: transactionsTable.category_id, total: sql<string>`COALESCE(SUM(amount::numeric), 0)` })
        .from(transactionsTable).where(and(eq(transactionsTable.type, "expense"), gte(transactionsTable.date, monthStart), lte(transactionsTable.date, today))).groupBy(transactionsTable.category_id).orderBy(desc(sql`SUM(amount::numeric)`)).limit(5),
    ]);

    const monthIncome = Number(monthRows.find(r => r.type === "income")?.total ?? 0);
    const monthExpenses = Number(monthRows.find(r => r.type === "expense")?.total ?? 0);
    const prevIncome = Number(prevRows.find(r => r.type === "income")?.total ?? 0);
    const prevExpenses = Number(prevRows.find(r => r.type === "expense")?.total ?? 0);

    const insights = [];
    const savingsRate = monthIncome > 0 ? (monthIncome - monthExpenses) / monthIncome : 0;

    if (savingsRate >= 0.3) {
      insights.push({ type: "savings_high", title: "Excellent savings rate", message: `You're saving ${Math.round(savingsRate * 100)}% of your income this month. Keep it up!`, severity: "success", category: null, amount: null, action: null });
    } else if (savingsRate < 0.1 && monthIncome > 0) {
      insights.push({ type: "savings_low", title: "Low savings rate", message: `Your savings rate is only ${Math.round(savingsRate * 100)}% this month. Consider reducing discretionary spending.`, severity: "warning", category: null, amount: null, action: "Review budget" });
    }

    if (monthExpenses > monthIncome && monthIncome > 0) {
      insights.push({ type: "overspend", title: "Spending exceeds income", message: `You've spent ₹${monthExpenses.toLocaleString("en-IN")} but earned only ₹${monthIncome.toLocaleString("en-IN")} this month.`, severity: "critical", category: null, amount: monthExpenses - monthIncome, action: "Cut expenses" });
    }

    if (prevExpenses > 0) {
      const expGrowth = ((monthExpenses - prevExpenses) / prevExpenses) * 100;
      if (expGrowth > 20) {
        insights.push({ type: "expense_growth", title: "Expenses rising fast", message: `Your expenses increased by ${Math.round(expGrowth)}% compared to last month.`, severity: "warning", category: null, amount: monthExpenses - prevExpenses, action: "Review categories" });
      }
    }

    for (const r of catRows.slice(0, 3)) {
      const cats = await db.select().from(categoriesTable).where(eq(categoriesTable.id, r.category_id)).limit(1);
      const catName = cats[0]?.name ?? "Unknown";
      insights.push({ type: "top_category", title: `High spend: ${catName}`, message: `₹${Number(r.total).toLocaleString("en-IN")} spent on ${catName} this month.`, severity: "info", category: catName, amount: Number(r.total), action: null });
    }

    let score = 50;
    if (savingsRate >= 0.2) score += 20;
    if (monthExpenses <= monthIncome) score += 20;
    if (insights.filter(i => i.severity === "critical").length === 0) score += 10;
    score = Math.min(100, score);

    return res.json({ insights, financial_score: score, generated_at: new Date().toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to get insights");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /analytics/report/weekly
router.get("/analytics/report/weekly", async (req, res) => {
  try {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(now); mon.setDate(diff);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const week_start = (req.query.week_start as string) || mon.toISOString().split("T")[0];
    const startD = new Date(week_start);
    const endD = new Date(startD); endD.setDate(startD.getDate() + 6);
    const week_end = endD.toISOString().split("T")[0];

    const rows = await db.select().from(transactionsTable)
      .where(and(gte(transactionsTable.date, week_start), lte(transactionsTable.date, week_end)));

    const inc = rows.filter(r => r.type === "income").reduce((s, r) => s + Number(r.amount), 0);
    const exp = rows.filter(r => r.type === "expense").reduce((s, r) => s + Number(r.amount), 0);

    // Daily data
    const dailyMap: Record<string, { income: number; expenses: number }> = {};
    for (const r of rows) {
      if (!dailyMap[r.date]) dailyMap[r.date] = { income: 0, expenses: 0 };
      if (r.type === "income") dailyMap[r.date].income += Number(r.amount);
      else dailyMap[r.date].expenses += Number(r.amount);
    }
    const dailyData = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({
      date, income: v.income, expenses: v.expenses, savings: v.income - v.expenses, balance: v.income - v.expenses,
    }));

    const biggest = dailyData.reduce((a, b) => b.expenses > a.expenses ? b : a, dailyData[0] ?? { date: null, expenses: -1 });
    const lowest = dailyData.filter(d => d.expenses > 0).reduce((a, b) => b.expenses < a.expenses ? b : a, dailyData[0] ?? { date: null, expenses: Infinity });
    const bestSaving = dailyData.reduce((a, b) => b.savings > a.savings ? b : a, dailyData[0] ?? { date: null, savings: -Infinity });

    // Category breakdown
    const catMap: Record<number, number> = {};
    for (const r of rows.filter(r => r.type === "expense")) {
      catMap[r.category_id] = (catMap[r.category_id] ?? 0) + Number(r.amount);
    }
    const topCategories = await Promise.all(Object.entries(catMap).sort(([, a], [, b]) => b - a).slice(0, 5).map(async ([id, amount]) => {
      const cats = await db.select().from(categoriesTable).where(eq(categoriesTable.id, Number(id))).limit(1);
      const cat = cats[0];
      return { category_id: Number(id), category_name: cat?.name ?? "Unknown", category_color: cat?.color ?? null, category_icon: cat?.icon ?? null, amount, percent: exp > 0 ? Math.round((amount / exp) * 100) : 0, transaction_count: rows.filter(r => r.category_id === Number(id)).length };
    }));

    const savingsRate = inc > 0 ? Math.round(((inc - exp) / inc) * 100) : 0;
    return res.json({
      week_start,
      week_end,
      summary: { income: inc, expenses: exp, savings: inc - exp },
      top_categories: topCategories,
      biggest_expense_day: biggest?.date ?? null,
      lowest_expense_day: lowest?.date ?? null,
      best_saving_day: bestSaving?.date ?? null,
      daily_data: dailyData,
      ai_summary: `This week you earned ₹${inc.toLocaleString("en-IN")} and spent ₹${exp.toLocaleString("en-IN")}, saving ₹${(inc - exp).toLocaleString("en-IN")} (${savingsRate}% savings rate).${savingsRate >= 20 ? " Great discipline!" : savingsRate < 0 ? " You spent more than you earned — review your expenses." : " There's room to save more."}`,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get weekly report");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /analytics/report/monthly
router.get("/analytics/report/monthly", async (req, res) => {
  try {
    const now = new Date();
    const year = Number(req.query.year ?? now.getFullYear());
    const month = Number(req.query.month ?? (now.getMonth() + 1));
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const end = new Date(year, month, 0).toISOString().split("T")[0];
    const prevY = month === 1 ? year - 1 : year;
    const prevM = month === 1 ? 12 : month - 1;
    const prevStart = `${prevY}-${String(prevM).padStart(2, "0")}-01`;
    const prevEnd = new Date(prevY, prevM, 0).toISOString().split("T")[0];

    const [rows, prevRows] = await Promise.all([
      db.select().from(transactionsTable).where(and(gte(transactionsTable.date, start), lte(transactionsTable.date, end))),
      db.select().from(transactionsTable).where(and(gte(transactionsTable.date, prevStart), lte(transactionsTable.date, prevEnd))),
    ]);

    const inc = rows.filter(r => r.type === "income").reduce((s, r) => s + Number(r.amount), 0);
    const exp = rows.filter(r => r.type === "expense").reduce((s, r) => s + Number(r.amount), 0);
    const prevInc = prevRows.filter(r => r.type === "income").reduce((s, r) => s + Number(r.amount), 0);
    const prevExp = prevRows.filter(r => r.type === "expense").reduce((s, r) => s + Number(r.amount), 0);

    const expAmounts = rows.filter(r => r.type === "expense").map(r => Number(r.amount));

    // Daily data
    const dailyMap: Record<string, { income: number; expenses: number }> = {};
    for (const r of rows) {
      if (!dailyMap[r.date]) dailyMap[r.date] = { income: 0, expenses: 0 };
      if (r.type === "income") dailyMap[r.date].income += Number(r.amount);
      else dailyMap[r.date].expenses += Number(r.amount);
    }
    const dailyData = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({
      date, income: v.income, expenses: v.expenses, savings: v.income - v.expenses, balance: v.income - v.expenses,
    }));

    const catMap: Record<number, number> = {};
    for (const r of rows.filter(r => r.type === "expense")) {
      catMap[r.category_id] = (catMap[r.category_id] ?? 0) + Number(r.amount);
    }
    const topCategories = await Promise.all(Object.entries(catMap).sort(([, a], [, b]) => b - a).slice(0, 5).map(async ([id, amount]) => {
      const cats = await db.select().from(categoriesTable).where(eq(categoriesTable.id, Number(id))).limit(1);
      const cat = cats[0];
      return { category_id: Number(id), category_name: cat?.name ?? "Unknown", category_color: cat?.color ?? null, category_icon: cat?.icon ?? null, amount, percent: exp > 0 ? Math.round((amount / exp) * 100) : 0, transaction_count: rows.filter(r => r.category_id === Number(id)).length };
    }));

    const savingsRate = inc > 0 ? Math.round(((inc - exp) / inc) * 100) : 0;
    return res.json({
      year, month,
      summary: { income: inc, expenses: exp, savings: inc - exp },
      top_categories: topCategories,
      budget_accuracy: 85,
      savings_rate: savingsRate,
      previous_month_comparison: { income: prevInc, expenses: prevExp, savings: prevInc - prevExp },
      highest_expense: expAmounts.length > 0 ? Math.max(...expAmounts) : null,
      lowest_expense: expAmounts.length > 0 ? Math.min(...expAmounts) : null,
      daily_data: dailyData,
      ai_summary: `In ${new Date(year, month - 1).toLocaleString("en-IN", { month: "long" })} ${year}, you earned ₹${inc.toLocaleString("en-IN")} and spent ₹${exp.toLocaleString("en-IN")}, with a savings rate of ${savingsRate}%.${inc > prevInc ? " Income grew from last month." : ""}${exp > prevExp ? " Expenses also increased — watch your spending." : " Expenses were controlled."}`,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get monthly report");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /analytics/cashflow
router.get("/analytics/cashflow", async (req, res) => {
  try {
    const now = new Date();
    const start_date = (req.query.start_date as string) || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const end_date = (req.query.end_date as string) || now.toISOString().split("T")[0];

    const rows = await db.select().from(transactionsTable)
      .where(and(gte(transactionsTable.date, start_date), lte(transactionsTable.date, end_date)));

    const byDate: Record<string, { income: number; expenses: number }> = {};
    for (const r of rows) {
      if (!byDate[r.date]) byDate[r.date] = { income: 0, expenses: 0 };
      if (r.type === "income") byDate[r.date].income += Number(r.amount);
      else byDate[r.date].expenses += Number(r.amount);
    }

    let runningBalance = 0;
    const result = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => {
      runningBalance += v.income - v.expenses;
      return { date, income: v.income, expenses: v.expenses, savings: v.income - v.expenses, balance: runningBalance };
    });
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get cashflow");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
