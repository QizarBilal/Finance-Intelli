import { Router } from "express";
import { collections, getCollection, withoutMongoIds } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import {
  GetRecentTransactionsQueryParams,
  GetUpcomingRemindersQueryParams,
} from "@workspace/api-zod";
import { periodRange } from "../lib/dates";
import { getAccountBalance } from "../lib/accounts";
const router = Router(),
  active = { $in: [null, undefined] };
async function stats(id: number, p: any, tz: string, ws: "monday" | "sunday") {
  const r = periodRange(p, tz, ws),
    c = await getCollection(collections.transactions),
    rows = await c
      .aggregate<any>([
        {
          $match: {
            profileId: id,
            deletedAt: active,
            status: { $ne: "void" },
            date: { $gte: r.from, $lte: r.to },
          },
        },
        { $group: { _id: "$type", total: { $sum: "$amount" } } },
      ])
      .toArray(),
    income = Number(rows.find((x) => x._id === "income")?.total ?? 0),
    expense = Number(rows.find((x) => x._id === "expense")?.total ?? 0);
  return { income, expense, savings: income - expense };
}
router.get("/dashboard/summary", requireAuth, async (req, res) => {
  const id = req.user!.userId,
    p = await getCollection(collections.profiles),
    profile: any = await p.findOne({ id }),
    tz = profile?.timezone ?? "UTC",
    ws = profile?.weekStarts === "sunday" ? "sunday" : "monday",
    [today, weekly, monthly, yearly] = await Promise.all([
      stats(id, "today", tz, ws),
      stats(id, "weekly", tz, ws),
      stats(id, "monthly", tz, ws),
      stats(id, "yearly", tz, ws),
    ]),
    a = await getCollection(collections.accounts),
    accounts = await a
      .find({ profileId: id, includeInNetWorth: true, archivedAt: active })
      .toArray(),
    balances = await Promise.all(
      accounts.map((x) => getAccountBalance(id, Number(x.id))),
    ),
    balance = balances.reduce((s, x) => s + x, 0),
    month = periodRange("monthly", tz, ws),
    t = await getCollection(collections.transactions),
    prior = await t
      .aggregate<any>([
        {
          $match: {
            profileId: id,
            accountId: { $in: accounts.map((x) => x.id) },
            deletedAt: active,
            status: { $ne: "void" },
            date: { $lt: month.from },
          },
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $cond: [
                  { $eq: ["$direction", "credit"] },
                  "$amount",
                  { $multiply: ["$amount", -1] },
                ],
              },
            },
          },
        },
      ])
      .toArray(),
    opening =
      accounts.reduce((s, x) => s + Number(x.openingBalance ?? 0), 0) +
      Number(prior[0]?.total ?? 0),
    trend = opening
      ? Math.round(((balance - opening) / Math.abs(opening)) * 1000) / 10
      : 0,
    b = await getCollection(collections.budgets),
    budgets = await b.find({ profileId: id, archivedAt: active }).toArray(),
    overall = budgets
      .filter((x) => x.period === "monthly" && !x.category)
      .reduce((s, x) => s + Number(x.limitAmount ?? x.amount ?? 0), 0),
    usage = overall ? (monthly.expense / overall) * 100 : 0,
    rate = monthly.income ? (monthly.savings / monthly.income) * 100 : 0,
    score = Math.min(
      100,
      Math.max(
        0,
        Math.round(
          (rate >= 30 ? 40 : rate >= 20 ? 35 : rate >= 10 ? 25 : rate * 1.5) +
            (budgets.length === 0
              ? 25
              : usage < 70
                ? 30
                : usage < 90
                  ? 20
                  : 10) +
            (balance > 0 ? 20 : 0) +
            (monthly.income || monthly.expense ? 10 : 0),
        ),
      ),
    );
  res.json({
    today,
    weekly,
    monthly,
    yearly,
    balance,
    savingsRate: Math.round(rate * 10) / 10,
    budgetUsagePercent: Math.round(usage * 10) / 10,
    financialHealthScore: score,
    balanceTrendPercent: trend,
    calculation: {
      balance:
        "Opening balances plus cleared and reconciled account ledger entries.",
      budgetUsage:
        "Monthly expenses divided only by non-overlapping overall monthly budgets.",
      healthScore:
        "Savings 40%, budget adherence 30%, positive net worth 20%, active data 10%.",
    },
  });
});
router.get("/dashboard/recent-transactions", requireAuth, async (req, res) => {
  const p = GetRecentTransactionsQueryParams.safeParse(req.query),
    limit = (p.success ? p.data.limit : 10) ?? 10,
    c = await getCollection(collections.transactions),
    rows: any[] = withoutMongoIds(
      await c
        .find({
          profileId: req.user!.userId,
          deletedAt: active,
          status: { $ne: "void" },
        })
        .sort({ date: -1, createdAt: -1 })
        .limit(limit)
        .toArray(),
    );
  res.json(
    rows.map((x) => ({
      ...x,
      amount: Number(x.amount),
      createdAt: new Date(x.createdAt).toISOString(),
    })),
  );
});
router.get("/dashboard/upcoming-reminders", requireAuth, async (req, res) => {
  const p = GetUpcomingRemindersQueryParams.safeParse(req.query),
    limit = (p.success ? p.data.limit : 5) ?? 5,
    c = await getCollection(collections.reminders),
    rows: any[] = withoutMongoIds(
      await c
        .find({
          profileId: req.user!.userId,
          dueDate: { $gte: new Date().toISOString().slice(0, 10) },
          isCompleted: false,
        })
        .sort({ dueDate: 1 })
        .limit(limit)
        .toArray(),
    );
  res.json(
    rows.map((x) => ({
      ...x,
      amount: x.amount == null ? null : Number(x.amount),
      createdAt: new Date(x.createdAt).toISOString(),
    })),
  );
});
export default router;
