import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/server/auth";
import { can } from "@/lib/permissions";
import { loadInvoiceRows } from "@/server/finance/queries";
import { dbDate } from "@/lib/dates";
import { toCsv } from "@/lib/domain/recurring";
import { INVOICE_STATUS } from "@/lib/labels";

const cents = (n: number) => (n / 100).toFixed(2);
const isDate = (s: string | null) => Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s));

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user.role, "finance:view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const where: Prisma.InvoiceWhereInput = {};
  if (isDate(from) || isDate(to)) where.issueDate = { ...(isDate(from) ? { gte: dbDate(from!) } : {}), ...(isDate(to) ? { lte: dbDate(to!) } : {}) };
  const rows = await loadInvoiceRows(where);
  const csv = toCsv(
    ["Number", "Client", "Description", "Issue date", "Due date", "Lifecycle", "Payment status", "Days overdue", "Subtotal (EUR)", "VAT (EUR)", "Total (EUR)", "Paid (EUR)", "Balance (EUR)", "Recurring"],
    rows.map((r) => [
      r.number,
      r.clientName,
      r.description ?? "",
      r.issueDate,
      r.dueDate,
      r.status,
      INVOICE_STATUS[r.state.status].label,
      r.state.daysOverdue || "",
      cents(r.subtotalCents),
      cents(r.vatCents),
      cents(r.totalCents),
      cents(r.state.paidCents),
      cents(r.status === "CANCELLED" ? 0 : r.state.balanceCents),
      r.isRecurring ? "yes" : "no",
    ]),
  );
  const name = `noise-invoices${from ? `-${from}` : ""}${to ? `_${to}` : ""}.csv`;
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
}
