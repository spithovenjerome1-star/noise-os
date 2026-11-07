import { percentOf, roundHalfUp } from "../money";
import type { PlainDate } from "../dates";

export type FinInvoice = {
  status: "DRAFT" | "SENT" | "CANCELLED";
  issueDate: PlainDate;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  payments: { amountCents: number; paidOn: PlainDate }[];
};

export type FinExpense = {
  date: PlainDate;
  amountCents: number; // gross paid
  vatCents: number;
  vatReclaimable: boolean;
  businessUsePct: number;
};

/** The business cost of an expense: gross minus reclaimable VAT, times business-use share. */
export function expenseCost(e: FinExpense) {
  const base = e.amountCents - (e.vatReclaimable ? e.vatCents : 0);
  return roundHalfUp((base * e.businessUsePct) / 100);
}

export function reclaimableVat(e: FinExpense) {
  return e.vatReclaimable ? roundHalfUp((e.vatCents * e.businessUsePct) / 100) : 0;
}

const inRange = (d: PlainDate, from: PlainDate, to: PlainDate) => d >= from && d <= to;

/** Issued (non-draft, non-cancelled) invoices count as revenue on their issue date (accrual view). */
export function isRevenueInvoice(i: Pick<FinInvoice, "status">) {
  return i.status === "SENT";
}

export function financeSummary(invoices: FinInvoice[], expenses: FinExpense[], from: PlainDate, to: PlainDate, estTaxRateBp: number) {
  let revenueNet = 0;
  let outputVat = 0;
  let invoicedGross = 0;
  let collected = 0;
  for (const i of invoices) {
    if (isRevenueInvoice(i) && inRange(i.issueDate, from, to)) {
      revenueNet += i.subtotalCents;
      outputVat += i.vatCents;
      invoicedGross += i.totalCents;
    }
    if (i.status !== "CANCELLED") for (const p of i.payments) if (inRange(p.paidOn, from, to)) collected += p.amountCents;
  }
  let expenseCostTotal = 0;
  let expenseGross = 0;
  let inputVat = 0;
  for (const e of expenses) {
    if (!inRange(e.date, from, to)) continue;
    expenseCostTotal += expenseCost(e);
    expenseGross += e.amountCents;
    inputVat += reclaimableVat(e);
  }
  const operatingProfit = revenueNet - expenseCostTotal;
  return {
    revenueNet,
    invoicedGross,
    outputVat,
    collected,
    expenseCost: expenseCostTotal,
    expenseGross,
    inputVat,
    vatPayableEstimate: outputVat - inputVat,
    operatingProfit,
    cashFlow: collected - expenseGross,
    estimatedTax: operatingProfit > 0 ? percentOf(operatingProfit, estTaxRateBp) : 0,
  };
}
