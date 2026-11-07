import type { InvoiceStatus } from "@prisma/client";
import { roundHalfUp, vatOnNet } from "../money";
import { daysBetween, type PlainDate } from "../dates";

export type LineInput = { qtyHundredths: number; unitCents: number; vatRateBp: number };

export function lineAmounts(l: LineInput) {
  const netCents = roundHalfUp((l.qtyHundredths * l.unitCents) / 100);
  return { netCents, vatCents: vatOnNet(netCents, l.vatRateBp) };
}

/** Totals with VAT computed per line and summed (also returned per rate). */
export function invoiceTotals(lines: LineInput[]) {
  let subtotal = 0;
  let vat = 0;
  const byRate = new Map<number, { netCents: number; vatCents: number }>();
  for (const l of lines) {
    const a = lineAmounts(l);
    subtotal += a.netCents;
    vat += a.vatCents;
    const r = byRate.get(l.vatRateBp) ?? { netCents: 0, vatCents: 0 };
    r.netCents += a.netCents;
    r.vatCents += a.vatCents;
    byRate.set(l.vatRateBp, r);
  }
  return {
    subtotalCents: subtotal,
    vatCents: vat,
    totalCents: subtotal + vat,
    byRate: [...byRate.entries()].map(([rateBp, v]) => ({ rateBp, ...v })).sort((a, b) => b.rateBp - a.rateBp),
  };
}

export type DisplayStatus = "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";

export type PaymentState = {
  status: DisplayStatus;
  paidCents: number;
  balanceCents: number;
  /** Past due and not fully paid. Independent of whether partial payments exist. */
  overdue: boolean;
  daysOverdue: number;
  overpaidCents: number;
};

/**
 * Derive the invoice's payment status from recorded payments only.
 * A due date passing never marks an invoice as paid.
 */
export function paymentState(
  inv: { status: InvoiceStatus; totalCents: number; dueDate: PlainDate },
  payments: { amountCents: number }[],
  today: PlainDate,
): PaymentState {
  const paid = payments.reduce((s, p) => s + p.amountCents, 0);
  const balance = Math.max(0, inv.totalCents - paid);
  const overpaid = Math.max(0, paid - inv.totalCents);
  if (inv.status === "CANCELLED")
    return { status: "CANCELLED", paidCents: paid, balanceCents: 0, overdue: false, daysOverdue: 0, overpaidCents: overpaid };
  if (inv.status === "DRAFT")
    return { status: "DRAFT", paidCents: paid, balanceCents: balance, overdue: false, daysOverdue: 0, overpaidCents: overpaid };
  const fullyPaid = paid >= inv.totalCents && inv.totalCents >= 0 && (paid > 0 || inv.totalCents === 0);
  const daysPast = daysBetween(inv.dueDate, today);
  const overdue = !fullyPaid && daysPast > 0;
  let status: DisplayStatus;
  if (fullyPaid) status = "PAID";
  else if (overdue) status = "OVERDUE";
  else if (paid > 0) status = "PARTIALLY_PAID";
  else status = "SENT";
  return { status, paidCents: paid, balanceCents: balance, overdue, daysOverdue: overdue ? daysPast : 0, overpaidCents: overpaid };
}

export function formatInvoiceNumber(prefix: string, n: number, padding: number) {
  return `${prefix}${String(n).padStart(padding, "0")}`;
}

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
};
