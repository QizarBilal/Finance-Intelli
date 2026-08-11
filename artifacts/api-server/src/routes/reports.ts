import { Router, type Request } from "express";
import PDFDocument from "pdfkit";
import { collections, getCollection, withoutMongoId } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
const router = Router();
function filter(req: Request) {
  const f: any = {
    profileId: req.user!.userId,
    deletedAt: null,
    status: { $ne: "void" },
  };
  if (req.query.dateFrom || req.query.dateTo)
    f.date = {
      ...(req.query.dateFrom ? { $gte: String(req.query.dateFrom) } : {}),
      ...(req.query.dateTo ? { $lte: String(req.query.dateTo) } : {}),
    };
  if (req.query.accountId) f.accountId = Number(req.query.accountId);
  if (req.query.category) f.category = String(req.query.category);
  if (req.query.tag) f.tags = { $regex: String(req.query.tag), $options: "i" };
  return f;
}
async function data(req: Request) {
  const txs: any[] = await (
      await getCollection(collections.transactions)
    )
      .find(filter(req))
      .sort({ date: 1, id: 1 })
      .toArray(),
    accounts: any[] = await (
      await getCollection(collections.accounts)
    )
      .find({ profileId: req.user!.userId })
      .toArray(),
    names = new Map(accounts.map((a) => [a.id, a.name]));
  return { txs, accounts, names };
}
router.get("/reports/summary", requireAuth, async (req, res) => {
  const { txs, accounts } = await data(req),
    income = txs
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + Number(t.amount), 0),
    expense = txs
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + Number(t.amount), 0),
    cats = new Map<string, number>();
  for (const t of txs.filter((t) => t.type === "expense"))
    cats.set(
      t.category || "Uncategorized",
      (cats.get(t.category || "Uncategorized") || 0) + Number(t.amount),
    );
  const all: any[] = await (
      await getCollection(collections.transactions)
    )
      .find({
        profileId: req.user!.userId,
        deletedAt: null,
        status: { $in: ["cleared", "reconciled"] },
      })
      .toArray(),
    balances = accounts
      .filter((a) => a.includeInNetWorth !== false)
      .map((a) => ({
        id: a.id,
        name: a.name,
        balance:
          Number(a.openingBalance || 0) +
          all
            .filter((t) => t.accountId === a.id)
            .reduce(
              (s, t) =>
                s + (t.direction === "credit" ? 1 : -1) * Number(t.amount),
              0,
            ),
      }));
  res.json({
    income,
    expense,
    savings: income - expense,
    transactionCount: txs.length,
    taxDeductible: txs
      .filter((t) => t.taxDeductible)
      .reduce((s, t) => s + Number(t.amount), 0),
    categories: [...cats]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
    accounts: balances,
    netWorth: balances.reduce((s, a) => s + a.balance, 0),
  });
});
router.get("/reports/export.csv", requireAuth, async (req, res) => {
  const { txs, names } = await data(req),
    escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="finance-intelli-${new Date().toISOString().slice(0, 10)}.csv"`,
  );
  res.write(
    "\uFEFFDate,Account,Type,Status,Amount,Category,Merchant,Description,Payment Method,Tags,Notes\n",
  );
  for (const t of txs)
    res.write(
      [
        t.date,
        names.get(t.accountId),
        t.type,
        t.status,
        t.amount,
        t.category,
        t.merchant,
        t.description,
        t.paymentMethod,
        t.tags,
        t.notes,
      ]
        .map(escape)
        .join(",") + "\n",
    );
  res.end();
});
router.get("/reports/statement.pdf", requireAuth, async (req, res) => {
  const { txs, names } = await data(req);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="finance-intelli-statement.pdf"',
  );
  const doc = new PDFDocument({ margin: 48, size: "A4" });
  doc.pipe(res);
  doc.fontSize(20).text("Finance Intelli Statement");
  doc
    .fontSize(9)
    .fillColor("#667085")
    .text(
      `Generated ${new Date().toLocaleString("en-IN")} · ${txs.length} entries`,
    )
    .moveDown();
  let total = 0;
  for (const t of txs.slice(0, 5000)) {
    const signed = (t.direction === "credit" ? 1 : -1) * Number(t.amount);
    total += signed;
    if (doc.y > 760) doc.addPage();
    doc
      .fillColor("#111827")
      .fontSize(9)
      .text(
        `${t.date}  ${names.get(t.accountId) || "Account"}  ${t.description || t.category || t.type}`,
        { continued: true, width: 420 },
      )
      .fillColor(signed >= 0 ? "#047857" : "#b42318")
      .text(
        `${signed >= 0 ? "+" : "-"}₹${Math.abs(signed).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
        { align: "right" },
      );
  }
  doc
    .moveDown()
    .fillColor("#111827")
    .fontSize(12)
    .text(
      `Net movement: ₹${total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      { align: "right" },
    );
  doc.end();
});
export default router;
