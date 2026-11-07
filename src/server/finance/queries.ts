import "server-only";
// Shared finance queries (used by invoices, expenses, analytics and the dashboard).
// All amounts are integer cents. All dates are Europe/Malta plain dates (YYYY-MM-DD).
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { addIntervalPlain, dbDate, endOfMonthPlain, monthKey, plainOf, startOfMonthPlain, todayMalta, type PlainDate } from "@/lib/dates";
import { paymentState, type DisplayStatus, type PaymentState } from "@/lib/domain/invoices";
import { expenseCost, financeSummary, type FinExpense, type FinInvoice } from "@/lib/domain/finance";
import { getSettings } from "../settings";

export type InvoiceRow = {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  description: string | null;
  issueDate: PlainDate;
  dueDate: PlainDate;
  status: "DRAFT" | "SENT" | "CANCELLED"; // stored lifecycle
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  isRecurring: boolean; // linked to a monthly retainer period
  state: PaymentState; // derived: display status, paid, balance, overdue
};

const invoiceInclude = {
  client: { select: { name: true } },
  payments: { select: { amountCents: true, paidOn: true } },
  packagePeriod: { select: { package: { select: { type: true } } } },
} satisfies Prisma.InvoiceInclude;

type InvoiceWithIncl = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

export function toInvoiceRow(i: InvoiceWithIncl, today = todayMalta()): InvoiceRow {
  const dueDate = plainOf(i.dueDate)!;
  return {
    id: i.id,
    number: i.number,
    clientId: i.clientId,
    clientName: i.client.name,
    description: i.description,
    issueDate: plainOf(i.issueDate)!,
    dueDate,
    status: i.status,
    subtotalCents: i.subtotalCents,
    vatCents: i.vatCents,
    totalCents: i.totalCents,
    isRecurring: i.packagePeriod?.package.type === "MONTHLY_RETAINER",
    state: paymentState({ status: i.status, totalCents: i.totalCents, dueDate }, i.payments, today),
  };
}

/** Invoices matching a Prisma filter, with derived payment state. */
export async function loadInvoiceRows(where: Prisma.InvoiceWhereInput = {}, today = todayMalta()): Promise<InvoiceRow[]> {
  const rows = await db.invoice.findMany({ where, include: invoiceInclude, orderBy: [{ issueDate: "desc" }, { number: "desc" }] });
  return rows.map((r) => toInvoiceRow(r, today));
}

export type OutstandingSummary = {
  rows: InvoiceRow[]; // sent invoices with a balance, most overdue first
  totalCents: number; // sum of balances
  overdueCents: number;
  count: number;
  overdueCount: number;
};

/** All sent, not fully paid invoices. Drafts and cancelled invoices are never "owed". */
export async function outstandingInvoices(today = todayMalta()): Promise<OutstandingSummary> {
  const rows = (await loadInvoiceRows({ status: "SENT" }, today)).filter((r) => r.state.balanceCents > 0);
  rows.sort((a, b) => b.state.daysOverdue - a.state.daysOverdue || a.dueDate.localeCompare(b.dueDate));
  const overdue = rows.filter((r) => r.state.overdue);
  return {
    rows,
    totalCents: rows.reduce((s, r) => s + r.state.balanceCents, 0),
    overdueCents: overdue.reduce((s, r) => s + r.state.balanceCents, 0),
    count: rows.length,
    overdueCount: overdue.length,
  };
}

async function loadFinInputs(from: PlainDate, to: PlainDate) {
  const [invoices, expenses] = await Promise.all([
    db.invoice.findMany({
      where: {
        status: { not: "DRAFT" },
        OR: [{ issueDate: { gte: dbDate(from), lte: dbDate(to) } }, { payments: { some: { paidOn: { gte: dbDate(from), lte: dbDate(to) } } } }],
      },
      select: { status: true, issueDate: true, subtotalCents: true, vatCents: true, totalCents: true, payments: { select: { amountCents: true, paidOn: true } } },
    }),
    db.expense.findMany({
      where: { date: { gte: dbDate(from), lte: dbDate(to) } },
      select: { date: true, amountCents: true, vatCents: true, vatReclaimable: true, businessUsePct: true },
    }),
  ]);
  const fi: FinInvoice[] = invoices.map((i) => ({
    status: i.status,
    issueDate: plainOf(i.issueDate)!,
    subtotalCents: i.subtotalCents,
    vatCents: i.vatCents,
    totalCents: i.totalCents,
    payments: i.payments.map((p) => ({ amountCents: p.amountCents, paidOn: plainOf(p.paidOn)! })),
  }));
  const fe: FinExpense[] = expenses.map((e) => ({ ...e, date: plainOf(e.date)! }));
  return { fi, fe };
}

export type FinanceSummary = ReturnType<typeof financeSummary>;

/**
 * Accrual + cash summary for a date range (inclusive).
 * { revenueNet, invoicedGross, outputVat, collected, expenseCost, expenseGross, inputVat,
 *   vatPayableEstimate, operatingProfit, cashFlow, estimatedTax }
 * Revenue = net (ex-VAT) of SENT invoices issued in range. Expense cost = gross − reclaimable VAT, × business use %.
 */
export async function loadFinanceSummary(from: PlainDate, to: PlainDate): Promise<FinanceSummary> {
  const [{ fi, fe }, settings] = await Promise.all([loadFinInputs(from, to), getSettings()]);
  return financeSummary(fi, fe, from, to, settings.estimatedTaxRateBp);
}

export type MonthPoint = { month: string; revenueNet: number; expenseCost: number; operatingProfit: number; collected: number };

/** Monthly series for the last `months` months ending with the month of `today`. */
export async function monthlySeries(months: number, today = todayMalta()): Promise<MonthPoint[]> {
  const end = endOfMonthPlain(today);
  const start = addIntervalPlain(startOfMonthPlain(today), "MONTHLY", -(months - 1));
  return monthlySeriesRange(start, end);
}

export async function monthlySeriesRange(start: PlainDate, end: PlainDate): Promise<MonthPoint[]> {
  const [{ fi, fe }, settings] = await Promise.all([loadFinInputs(start, end), getSettings()]);
  const out: MonthPoint[] = [];
  for (let m = startOfMonthPlain(start); m <= end; m = addIntervalPlain(m, "MONTHLY", 1)) {
    const s = financeSummary(fi, fe, m, endOfMonthPlain(m), settings.estimatedTaxRateBp);
    out.push({ month: monthKey(m), revenueNet: s.revenueNet, expenseCost: s.expenseCost, operatingProfit: s.operatingProfit, collected: s.collected });
  }
  return out;
}

export type ExpenseBreakdown = { category: string; costCents: number; grossCents: number; count: number }[];

export async function expenseBreakdown(from: PlainDate, to: PlainDate): Promise<ExpenseBreakdown> {
  const rows = await db.expense.findMany({
    where: { date: { gte: dbDate(from), lte: dbDate(to) } },
    select: { category: true, amountCents: true, vatCents: true, vatReclaimable: true, businessUsePct: true, date: true },
  });
  const map = new Map<string, { costCents: number; grossCents: number; count: number }>();
  for (const e of rows) {
    const m = map.get(e.category) ?? { costCents: 0, grossCents: 0, count: 0 };
    m.costCents += expenseCost({ ...e, date: plainOf(e.date)! });
    m.grossCents += e.amountCents;
    m.count++;
    map.set(e.category, m);
  }
  return [...map.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.costCents - a.costCents);
}

export type { DisplayStatus };
