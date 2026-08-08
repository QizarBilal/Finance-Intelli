import { Router } from "express";
import PDFDocument from "pdfkit";
import { and, asc, eq, gte, ilike, isNull, lte, sql } from "drizzle-orm";
import { accountsTable, db, transactionsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router = Router();

function filters(req: Parameters<Parameters<typeof router.get>[1]>[0]) {
  const conditions = [
    eq(transactionsTable.profileId, req.user!.userId),
    isNull(transactionsTable.deletedAt),
    sql`${transactionsTable.status} <> 'void'`,
  ];
  if (req.query.dateFrom) conditions.push(gte(transactionsTable.date, String(req.query.dateFrom)));
  if (req.query.dateTo) conditions.push(lte(transactionsTable.date, String(req.query.dateTo)));
  if (req.query.accountId) conditions.push(eq(transactionsTable.accountId, Number(req.query.accountId)));
  if (req.query.category) conditions.push(eq(transactionsTable.category, String(req.query.category)));
  if (req.query.tag) conditions.push(ilike(transactionsTable.tags, `%${String(req.query.tag)}%`));
  return and(...conditions);
}

router.get("/reports/summary", requireAuth, async (req, res) => {
  const where = filters(req);
  const [totals, categories, accounts] = await Promise.all([
    db.select({
      income: sql<string>`coalesce(sum(case when ${transactionsTable.type}='income' then ${transactionsTable.amount} else 0 end),0)`,
      expense: sql<string>`coalesce(sum(case when ${transactionsTable.type}='expense' then ${transactionsTable.amount} else 0 end),0)`,
      taxDeductible: sql<string>`coalesce(sum(case when ${transactionsTable.taxDeductible} then ${transactionsTable.amount} else 0 end),0)`,
      count: sql<number>`count(*)::int`,
    }).from(transactionsTable).where(where),
    db.select({ category: transactionsTable.category, amount: sql<string>`sum(${transactionsTable.amount})` })
      .from(transactionsTable).where(and(where, eq(transactionsTable.type, "expense")))
      .groupBy(transactionsTable.category).orderBy(sql`sum(${transactionsTable.amount}) desc`),
    db.select({
      id: accountsTable.id, name: accountsTable.name, opening: accountsTable.openingBalance,
      movement: sql<string>`coalesce(sum(case when ${transactionsTable.direction}='credit' then ${transactionsTable.amount} else -${transactionsTable.amount} end),0)`,
    }).from(accountsTable).leftJoin(transactionsTable, and(
      eq(transactionsTable.accountId, accountsTable.id), isNull(transactionsTable.deletedAt),
      sql`${transactionsTable.status} in ('cleared','reconciled')`,
    )).where(and(eq(accountsTable.profileId, req.user!.userId), eq(accountsTable.includeInNetWorth, true)))
      .groupBy(accountsTable.id),
  ]);
  const income = Number(totals[0]?.income ?? 0);
  const expense = Number(totals[0]?.expense ?? 0);
  res.json({
    income, expense, savings: income - expense, transactionCount: totals[0]?.count ?? 0,
    taxDeductible: Number(totals[0]?.taxDeductible ?? 0),
    categories: categories.map(row => ({ category: row.category ?? "Uncategorized", amount: Number(row.amount) })),
    accounts: accounts.map(row => ({ id: row.id, name: row.name, balance: Number(row.opening) + Number(row.movement) })),
    netWorth: accounts.reduce((sum, row) => sum + Number(row.opening) + Number(row.movement), 0),
  });
});

router.get("/reports/export.csv", requireAuth, async (req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="finance-intelli-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.write("\uFEFFDate,Account,Type,Status,Amount,Category,Merchant,Description,Payment Method,Tags,Notes\n");
  const where = filters(req);
  const batchSize = 500;
  let offset = 0;
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  while (true) {
    const rows = await db.select({
      transaction: transactionsTable,
      accountName: accountsTable.name,
    }).from(transactionsTable).innerJoin(accountsTable, eq(accountsTable.id, transactionsTable.accountId))
      .where(where).orderBy(asc(transactionsTable.date), asc(transactionsTable.id)).limit(batchSize).offset(offset);
    for (const { transaction: tx, accountName } of rows) {
      res.write([
        tx.date, accountName, tx.type, tx.status, tx.amount, tx.category, tx.merchant,
        tx.description, tx.paymentMethod, tx.tags, tx.notes,
      ].map(escape).join(",") + "\n");
    }
    if (rows.length < batchSize) break;
    offset += batchSize;
  }
  res.end();
});

router.get("/reports/statement.pdf", requireAuth, async (req, res) => {
  const rows = await db.select({ transaction: transactionsTable, accountName: accountsTable.name })
    .from(transactionsTable).innerJoin(accountsTable, eq(accountsTable.id, transactionsTable.accountId))
    .where(filters(req)).orderBy(asc(transactionsTable.date), asc(transactionsTable.id)).limit(5000);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="finance-intelli-statement.pdf"');
  const document = new PDFDocument({ margin: 48, size: "A4" });
  document.pipe(res);
  document.fontSize(20).text("Finance Intelli Statement");
  document.fontSize(9).fillColor("#667085").text(`Generated ${new Date().toLocaleString("en-IN")} · ${rows.length} entries`);
  document.moveDown();
  let total = 0;
  for (const { transaction: tx, accountName } of rows) {
    const signed = tx.direction === "credit" ? Number(tx.amount) : -Number(tx.amount);
    total += signed;
    if (document.y > 760) document.addPage();
    document.fillColor("#111827").fontSize(9).text(
      `${tx.date}  ${accountName}  ${tx.description ?? tx.category ?? tx.type}`,
      { continued: true, width: 420 },
    ).fillColor(signed >= 0 ? "#047857" : "#b42318").text(
      `${signed >= 0 ? "+" : "-"}₹${Math.abs(signed).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      { align: "right" },
    );
  }
  document.moveDown().fillColor("#111827").fontSize(12).text(`Net movement: ₹${total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, { align: "right" });
  document.end();
});

export default router;
