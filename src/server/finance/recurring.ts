import "server-only";
// STUB — implemented by the finance module. Contract used by automations:
// Generates Expense rows for active RecurringExpense templates whose nextDate <= today. Idempotent.
export async function generateRecurringExpenses(_today?: string): Promise<{ created: number }> {
  return { created: 0 };
}
