export type LedgerEntry = { amount: number; direction: "debit" | "credit"; status?: string };

export function signedAmount(entry: LedgerEntry): number {
  if (!Number.isFinite(entry.amount) || entry.amount < 0) throw new Error("Ledger amount must be non-negative");
  return entry.direction === "credit" ? entry.amount : -entry.amount;
}

export function ledgerBalance(openingBalance: number, entries: LedgerEntry[]): number {
  return entries
    .filter(entry => entry.status == null || entry.status === "cleared" || entry.status === "reconciled")
    .reduce((balance, entry) => balance + signedAmount(entry), openingBalance);
}

export function transferIsBalanced(entries: LedgerEntry[]): boolean {
  return Math.abs(entries.reduce((sum, entry) => sum + signedAmount(entry), 0)) < 0.005;
}
