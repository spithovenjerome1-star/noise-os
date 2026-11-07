import "server-only";
import { db } from "@/lib/db";
import { dbDate, plainOf, todayMalta } from "@/lib/dates";
import { dueOccurrences } from "@/lib/domain/recurring";

/**
 * Generates Expense rows for active RecurringExpense templates whose nextDate <= today.
 * Catches up missed periods, advances nextDate, respects endDate. Idempotent thanks to
 * @@unique([recurringId, date]) — re-running never duplicates.
 */
export async function generateRecurringExpenses(today: string = todayMalta()): Promise<{ created: number }> {
  const templates = await db.recurringExpense.findMany({ where: { active: true, nextDate: { lte: dbDate(today) } } });
  let created = 0;
  for (const t of templates) {
    const { dates, nextDate, finished } = dueOccurrences(
      { nextDate: plainOf(t.nextDate)!, interval: t.interval, endDate: plainOf(t.endDate) },
      today,
    );
    await db.$transaction(async (tx) => {
      for (const d of dates) {
        const r = await tx.expense.createMany({
          data: [
            {
              description: t.description,
              amountCents: t.amountCents,
              vatCents: t.vatCents,
              date: dbDate(d),
              category: t.category,
              vendor: t.vendor,
              paymentMethod: t.paymentMethod,
              businessUsePct: t.businessUsePct,
              recurringId: t.id,
              notes: "Generated from recurring expense",
            },
          ],
          skipDuplicates: true,
        });
        created += r.count;
      }
      await tx.recurringExpense.update({ where: { id: t.id }, data: { nextDate: dbDate(nextDate), active: finished ? false : t.active } });
    });
  }
  return { created };
}
