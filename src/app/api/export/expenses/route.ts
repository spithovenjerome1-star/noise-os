import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/server/auth";
import { can } from "@/lib/permissions";
import { dbDate, plainOf } from "@/lib/dates";
import { toCsv } from "@/lib/domain/recurring";
import { expenseCost, reclaimableVat } from "@/lib/domain/finance";
import { EXPENSE_CATEGORY, PAYMENT_METHOD } from "@/lib/labels";

const cents = (n: number) => (n / 100).toFixed(2);
const isDate = (s: string | null) => Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s));

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user.role, "finance:view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const where: Prisma.ExpenseWhereInput = {};
  if (isDate(from) || isDate(to)) where.date = { ...(isDate(from) ? { gte: dbDate(from!) } : {}), ...(isDate(to) ? { lte: dbDate(to!) } : {}) };
  const rows = await db.expense.findMany({ where, orderBy: { date: "asc" }, include: { client: { select: { name: true } }, project: { select: { name: true } }, _count: { select: { attachments: true } } } });
  const csv = toCsv(
    ["Date", "Description", "Vendor", "Category", "Gross (EUR)", "VAT (EUR)", "VAT reclaimable", "Business use %", "Reclaimable VAT (EUR)", "Business cost (EUR)", "Payment method", "Client", "Project", "Recurring", "Receipts", "Notes"],
    rows.map((e) => {
      const fe = { date: plainOf(e.date)!, amountCents: e.amountCents, vatCents: e.vatCents, vatReclaimable: e.vatReclaimable, businessUsePct: e.businessUsePct };
      return [
        plainOf(e.date),
        e.description,
        e.vendor ?? "",
        EXPENSE_CATEGORY[e.category],
        cents(e.amountCents),
        cents(e.vatCents),
        e.vatReclaimable ? "yes" : "no",
        e.businessUsePct,
        cents(reclaimableVat(fe)),
        cents(expenseCost(fe)),
        PAYMENT_METHOD[e.paymentMethod],
        e.client?.name ?? "",
        e.project?.name ?? "",
        e.recurringId ? "yes" : "no",
        e._count.attachments,
        e.notes ?? "",
      ];
    }),
  );
  const name = `noise-expenses${from ? `-${from}` : ""}${to ? `_${to}` : ""}.csv`;
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
}
