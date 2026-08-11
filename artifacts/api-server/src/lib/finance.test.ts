import assert from "node:assert/strict";
import test from "node:test";
import { ledgerBalance, transferIsBalanced } from "./finance.ts";
import { resolveBudgetCategory, sumExpensesForCategory } from "./budgeting.ts";

test("account balance equals opening balance plus posted ledger entries", () => {
  assert.equal(
    ledgerBalance(1000, [
      { amount: 500, direction: "credit", status: "cleared" },
      { amount: 125, direction: "debit", status: "reconciled" },
      { amount: 999, direction: "debit", status: "pending" },
    ]),
    1375,
  );
});

test("dashboard balance matches included account ledger movement", () => {
  assert.equal(
    ledgerBalance(20_000, [
      { amount: 55, direction: "debit", status: "cleared" },
    ]),
    19_945,
  );
});

test("a two-sided transfer cannot create or destroy money", () => {
  assert.equal(
    transferIsBalanced([
      { amount: 250, direction: "debit" },
      { amount: 250, direction: "credit" },
    ]),
    true,
  );
  assert.equal(
    transferIsBalanced([
      { amount: 250, direction: "debit" },
      { amount: 249, direction: "credit" },
    ]),
    false,
  );
});

test("legacy blank budget categories resolve from the budget name", () => {
  const category = resolveBudgetCategory({ name: "Breakfast", category: "" }, [
    "Breakfast",
    "Lunch",
    "Dinner",
  ]);
  assert.equal(category, "Breakfast");
  assert.equal(
    sumExpensesForCategory(
      [
        { category: "Breakfast", amount: 37 },
        { category: "Lunch", amount: 50 },
        { category: "breakfast", amount: 33 },
      ],
      category,
    ),
    70,
  );
});
