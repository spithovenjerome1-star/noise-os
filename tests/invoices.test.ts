import { describe, expect, it } from "vitest";
import { invoiceTotals, lineAmounts, paymentState, formatInvoiceNumber } from "@/lib/domain/invoices";

describe("invoice totals", () => {
  it("computes line amounts from hundredths quantity", () => {
    expect(lineAmounts({ qtyHundredths: 150, unitCents: 10000, vatRateBp: 0 })).toEqual({ netCents: 15000, vatCents: 0 });
    expect(lineAmounts({ qtyHundredths: 100, unitCents: 59900, vatRateBp: 1800 })).toEqual({ netCents: 59900, vatCents: 10782 });
  });
  it("sums multi-rate invoices with a per-rate breakdown", () => {
    const t = invoiceTotals([
      { qtyHundredths: 100, unitCents: 59900, vatRateBp: 1800 },
      { qtyHundredths: 150, unitCents: 10000, vatRateBp: 0 },
      { qtyHundredths: 200, unitCents: 2500, vatRateBp: 1800 },
    ]);
    expect(t.subtotalCents).toBe(59900 + 15000 + 5000);
    expect(t.vatCents).toBe(10782 + 900);
    expect(t.totalCents).toBe(t.subtotalCents + t.vatCents);
    expect(t.byRate).toEqual([
      { rateBp: 1800, netCents: 64900, vatCents: 11682 },
      { rateBp: 0, netCents: 15000, vatCents: 0 },
    ]);
  });
  it("rounds VAT per line (documented behaviour)", () => {
    const t = invoiceTotals([
      { qtyHundredths: 100, unitCents: 3, vatRateBp: 1800 },
      { qtyHundredths: 100, unitCents: 3, vatRateBp: 1800 },
    ]);
    expect(t.vatCents).toBe(2);
  });
  it("formats invoice numbers", () => {
    expect(formatInvoiceNumber("NOISE-", 7, 4)).toBe("NOISE-0007");
    expect(formatInvoiceNumber("INV", 12345, 4)).toBe("INV12345");
  });
});

describe("paymentState", () => {
  const sent = { status: "SENT" as const, totalCents: 10000, dueDate: "2026-11-10" };

  it("unpaid before due date is Sent", () => {
    const s = paymentState(sent, [], "2026-11-05");
    expect(s).toMatchObject({ status: "SENT", paidCents: 0, balanceCents: 10000, overdue: false });
  });
  it("due date itself is not overdue", () => {
    expect(paymentState(sent, [], "2026-11-10").overdue).toBe(false);
  });
  it("a passed due date never marks an invoice as paid", () => {
    const s = paymentState(sent, [], "2027-01-01");
    expect(s.status).toBe("OVERDUE");
    expect(s.paidCents).toBe(0);
    expect(s.balanceCents).toBe(10000);
  });
  it("partial payment", () => {
    const s = paymentState(sent, [{ amountCents: 3000 }, { amountCents: 2000 }], "2026-11-05");
    expect(s).toMatchObject({ status: "PARTIALLY_PAID", paidCents: 5000, balanceCents: 5000, overdue: false });
  });
  it("partial and overdue are reported independently", () => {
    const s = paymentState(sent, [{ amountCents: 3000 }], "2026-11-22");
    expect(s.status).toBe("OVERDUE");
    expect(s.overdue).toBe(true);
    expect(s.daysOverdue).toBe(12);
    expect(s.paidCents).toBe(3000);
    expect(s.balanceCents).toBe(7000);
  });
  it("fully paid, even if paid late", () => {
    const s = paymentState(sent, [{ amountCents: 10000 }], "2027-02-01");
    expect(s).toMatchObject({ status: "PAID", balanceCents: 0, overdue: false, daysOverdue: 0 });
  });
  it("overpayment is reported, balance never negative", () => {
    const s = paymentState(sent, [{ amountCents: 12500 }], "2026-11-05");
    expect(s).toMatchObject({ status: "PAID", balanceCents: 0, overpaidCents: 2500 });
  });
  it("drafts are never overdue or paid", () => {
    const s = paymentState({ ...sent, status: "DRAFT" }, [], "2027-01-01");
    expect(s).toMatchObject({ status: "DRAFT", overdue: false });
  });
  it("cancelled invoices owe nothing", () => {
    const s = paymentState({ ...sent, status: "CANCELLED" }, [{ amountCents: 1000 }], "2027-01-01");
    expect(s).toMatchObject({ status: "CANCELLED", balanceCents: 0, overdue: false });
  });
});
