import { accountsTable, db, transactionsTable } from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";

export async function ensureDefaultAccount(profileId: number, currency = "INR"): Promise<number> {
  const [existing] = await db.select({ id: accountsTable.id }).from(accountsTable)
    .where(and(eq(accountsTable.profileId, profileId), eq(accountsTable.status, "active")))
    .orderBy(accountsTable.id).limit(1);
  if (existing) return existing.id;
  const [created] = await db.insert(accountsTable).values({
    profileId, name: "Primary account", type: "bank", currency, openingBalance: "0",
  }).returning({ id: accountsTable.id });
  return created.id;
}

export async function getAccountBalance(profileId: number, accountId: number): Promise<number> {
  const [row] = await db.select({
    opening: accountsTable.openingBalance,
    movement: sql<string>`coalesce(sum(case when ${transactionsTable.direction} = 'credit' then ${transactionsTable.amount} else -${transactionsTable.amount} end), 0)`,
  }).from(accountsTable)
    .leftJoin(transactionsTable, and(
      eq(transactionsTable.accountId, accountsTable.id),
      isNull(transactionsTable.deletedAt),
      sql`${transactionsTable.status} <> 'void'`,
    ))
    .where(and(eq(accountsTable.id, accountId), eq(accountsTable.profileId, profileId)))
    .groupBy(accountsTable.id);
  if (!row) throw Object.assign(new Error("Account not found"), { status: 404 });
  return Number(row.opening) + Number(row.movement);
}
