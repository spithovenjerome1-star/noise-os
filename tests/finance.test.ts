import { describe, expect, it } from "vitest";
import { expenseCost, reclaimableVat, financeSummary, type FinExpense, type FinInvoice } from "@/lib/domain/finance";

const exp = (p: Partial<FinExpense>): FinExpense => ({ date: "2026-11-05", amountCents: 11800, vatCents: 1800, vatReclaimable: true, businessUsePct: 100, ...p });

describe("expenseCost", () => {
  it("excludes reclaimable VAT", () => {
    expect(expenseCost(exp({}))).toBe(10000);
    expect(reclaimableVat(exp({}))).toBe(1800);
  });
  it("keeps non-reclaimable VAT as a cost", () => {
    expect(expenseCost(exp({ vatReclaimable: false }))).toBe(11800);
    expect(reclaimableVat(exp({ vatReclaimable: false }))).toBe(0);
  });
  it("applies business-use percentage to cost and reclaimable VAT", () => {
    expect(expenseCost(exp({ businessUsePct: 60 }))).toBe(6000);
    expect(reclaimableVat(exp({ businessUsePct: 60 }))).toBe(1080);
    expect(expenseCost(exp({ businessUsePct: 0 }))).toBe(0);
  });
});

describe("financeSummary", () => {
  const invoices: FinInvoice[] = [
    { status: "SENT", issueDate: "2026-11-02", subtotalCents: 59900, vatCents: 10782, totalCents: 70682, payments: [{ amountCents: 30000, paidOn: "2026-11-20" }] },
    { status: "SENT", issueDate: "2026-10-28", subtotalCents: 10000, vatCents: 1800, totalCents: 11800, payments: [{ amountCents: 11800, paidOn: "2026-11-03" }] },
    { status: "DRAFT", issueDate: "2026-11-04", subtotalCents: 99900, vatCents: 0, totalCents: 99900, payments: [] },
    { status: "CANCELLED", issueDate: "2026-11-04", subtotalCents: 50000, vatCents: 9000, totalCents: 59000, payments: [{ amountCents: 1000, paidOn: "2026-11-04" }] },
  ];
  const expenses: FinExpense[] = [exp({}), exp({ date: "2026-12-01" }), exp({ businessUsePct: 50, vatReclaimable: false, amountCents: 2000, vatCents: 0 })];

  it("counts only sent invoices issued in range as revenue, and payments by date as cash", () => {
    const s = financeSummary(invoices, expenses, "2026-11-01", "2026-11-30", 1500);
    expect(s.revenueNet).toBe(59900);
    expect(s.outputVat).toBe(10782);
    expect(s.collected).toBe(30000 + 11800); // cancelled invoice payments excluded
    expect(s.expenseCost).toBe(10000 + 1000);
    expect(s.expenseGross).toBe(11800 + 2000);
    expect(s.inputVat).toBe(1800);
    expect(s.vatPayableEstimate).toBe(10782 - 1800);
    expect(s.operatingProfit).toBe(59900 - 11000);
    expect(s.cashFlow).toBe(41800 - 13800);
    expect(s.estimatedTax).toBe(Math.round((59900 - 11000) * 0.15));
  });
  it("no estimated tax on a loss", () => {
    const s = financeSummary([], expenses, "2026-11-01", "2026-11-30", 1500);
    expect(s.operatingProfit).toBeLessThan(0);
    expect(s.estimatedTax).toBe(0);
  });
});
