export type BudgetLike = { name?: unknown; category?: unknown };
export type ExpenseLike = { category?: unknown; amount?: unknown };

const normalized = (value: unknown) =>
  typeof value === "string" ? value.trim().toLocaleLowerCase() : "";

const genericCategories = new Set(["", "all categories", "all category"]);

export function resolveBudgetCategory(
  budget: BudgetLike,
  availableCategories: unknown[],
): string | null {
  const stored = normalized(budget.category);
  if (!genericCategories.has(stored)) {
    return String(budget.category).trim();
  }

  const budgetName = normalized(budget.name);
  const match = availableCategories.find(
    (category) => normalized(category) === budgetName,
  );
  return typeof match === "string" ? match.trim() : null;
}

export function sumExpensesForCategory(
  expenses: ExpenseLike[],
  category: string | null,
): number {
  const target = normalized(category);
  return expenses
    .filter((expense) => !target || normalized(expense.category) === target)
    .reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);
}
