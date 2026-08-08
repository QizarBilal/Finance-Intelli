import assert from "node:assert/strict";
import test from "node:test";
import { ledgerBalance, transferIsBalanced } from "./finance.ts";

test("account balance equals opening balance plus posted ledger entries", () => {
  assert.equal(ledgerBalance(1000, [
    { amount: 500, direction: "credit", status: "cleared" },
    { amount: 125, direction: "debit", status: "reconciled" },
    { amount: 999, direction: "debit", status: "pending" },
  ]), 1375);
});

test("a two-sided transfer cannot create or destroy money", () => {
  assert.equal(transferIsBalanced([
    { amount: 250, direction: "debit" },
    { amount: 250, direction: "credit" },
  ]), true);
  assert.equal(transferIsBalanced([
    { amount: 250, direction: "debit" },
    { amount: 249, direction: "credit" },
  ]), false);
});
