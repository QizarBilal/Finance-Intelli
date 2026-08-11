import { collections, getCollection, nextId } from "@workspace/db";

export async function ensureDefaultAccount(profileId: number, currency = "INR"): Promise<number> {
  const accounts = await getCollection(collections.accounts);
  const existing = await accounts.findOne({ profileId, status: "active", archivedAt: { $in: [null, undefined] } }, { sort: { id: 1 } });
  if (existing?.id) return existing.id;
  const now = new Date();
  const account = {
    id: await nextId(collections.accounts), profileId, name: "Primary account", type: "bank", currency,
    openingBalance: 0, currentBalance: 0, status: "active", version: 1, includeInNetWorth: true,
    institution: null, accountNumberLast4: null, color: null, icon: null, archivedAt: null,
    createdAt: now, updatedAt: now,
  };
  await accounts.insertOne(account);
  return account.id;
}

export async function getAccountBalance(profileId: number, accountId: number): Promise<number> {
  const accounts = await getCollection(collections.accounts);
  const transactions = await getCollection(collections.transactions);
  const account = await accounts.findOne({ id: accountId, profileId });
  if (!account) throw Object.assign(new Error("Account not found"), { status: 404 });
  const [movement] = await transactions.aggregate<{ total: number }>([
    { $match: { profileId, accountId, deletedAt: null, status: { $ne: "void" } } },
    { $group: { _id: null, total: { $sum: { $cond: [{ $eq: ["$direction", "credit"] }, "$amount", { $multiply: ["$amount", -1] }] } } } },
  ]).toArray();
  return Number(account.openingBalance ?? 0) + Number(movement?.total ?? 0);
}
