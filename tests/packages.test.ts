import { describe, it, expect } from "vitest";
import { computePeriodProgress, computeRollover, monthlyPeriodEnd, periodsToCreate, nextMonthlyPeriod } from "@/lib/domain/packages";

const v = (category: Parameters<typeof computePeriodProgress>[1][number]["category"], isExtra = false) => ({ category, isExtra });

describe("computePeriodProgress", () => {
  it("counts each video once and separates approved from delivered", () => {
    const p = computePeriodProgress({ videosIncluded: 10, rolledOverIn: 0 }, [
      ...Array(6).fill(v("DELIVERED")),
      v("APPROVED"),
      v("AWAITING_APPROVAL"),
      v("EDITING"),
    ]);
    expect(p.included).toBe(10);
    expect(p.delivered).toBe(6);
    expect(p.approvedNotDelivered).toBe(1);
    expect(p.completed).toBe(7);
    expect(p.remaining).toBe(4);
    expect(p.assigned).toBe(9);
    expect(p.unplanned).toBe(1);
    expect(p.pctDelivered).toBe(60);
    expect(p.pctCompleted).toBe(70);
  });

  it("excludes extras from the package count", () => {
    const p = computePeriodProgress({ videosIncluded: 2, rolledOverIn: 0 }, [v("DELIVERED"), v("DELIVERED", true), v("PLANNED", true)]);
    expect(p.delivered).toBe(1);
    expect(p.remaining).toBe(1);
    expect(p.extras).toBe(2);
    expect(p.extrasDelivered).toBe(1);
  });

  it("includes rollover and reports overage without negative remaining", () => {
    const p = computePeriodProgress({ videosIncluded: 2, rolledOverIn: 1 }, Array(4).fill(v("DELIVERED")));
    expect(p.included).toBe(3);
    expect(p.remaining).toBe(0);
    expect(p.overage).toBe(1);
    expect(p.pctDelivered).toBe(100);
  });

  it("handles zero-video packages", () => {
    const p = computePeriodProgress({ videosIncluded: 0, rolledOverIn: 0 }, []);
    expect(p.remaining).toBe(0);
    expect(p.pctDelivered).toBe(0);
  });
});

describe("computeRollover", () => {
  it("applies policies", () => {
    expect(computeRollover("NONE", null, { remaining: 3 })).toBe(0);
    expect(computeRollover("ROLLOVER_ALL", null, { remaining: 3 })).toBe(3);
    expect(computeRollover("ROLLOVER_CAPPED", 2, { remaining: 3 })).toBe(2);
    expect(computeRollover("ROLLOVER_CAPPED", 5, { remaining: 3 })).toBe(3);
    expect(computeRollover("ROLLOVER_CAPPED", null, { remaining: 3 })).toBe(0);
  });
});

describe("monthly periods", () => {
  it("anchors to the start day of month", () => {
    expect(monthlyPeriodEnd("2026-01-15", "2026-01-15")).toBe("2026-02-14");
    expect(monthlyPeriodEnd("2026-01-15", "2026-02-15")).toBe("2026-03-14");
    expect(monthlyPeriodEnd("2026-01-01", "2026-01-01")).toBe("2026-01-31");
    expect(monthlyPeriodEnd("2026-01-01", "2026-02-01")).toBe("2026-02-28");
  });

  it("handles month-end anchors (Jan 31) without gaps or overlaps", () => {
    const periods = periodsToCreate({ startDate: "2026-01-31", endDate: null }, null, "2026-06-30");
    for (let i = 1; i < periods.length; i++) {
      const prevEnd = new Date(periods[i - 1]!.end + "T00:00:00Z");
      const start = new Date(periods[i]!.start + "T00:00:00Z");
      expect(start.getTime() - prevEnd.getTime()).toBe(86400000);
    }
    expect(periods[0]).toEqual({ start: "2026-01-31", end: "2026-02-27" });
    expect(periods.at(-1)!.start <= "2026-06-30").toBe(true);
    expect(periods.at(-1)!.end >= "2026-06-30").toBe(true);
  });

  it("creates only missing periods up to today and respects end date", () => {
    expect(periodsToCreate({ startDate: "2026-01-01", endDate: null }, "2026-02-28", "2026-03-10")).toEqual([{ start: "2026-03-01", end: "2026-03-31" }]);
    expect(periodsToCreate({ startDate: "2026-01-01", endDate: null }, "2026-03-31", "2026-03-10")).toEqual([]);
    expect(periodsToCreate({ startDate: "2026-01-01", endDate: "2026-02-15" }, null, "2026-05-01")).toEqual([
      { start: "2026-01-01", end: "2026-01-31" },
      { start: "2026-02-01", end: "2026-02-15" },
    ]);
    expect(periodsToCreate({ startDate: "2026-09-01", endDate: null }, null, "2026-08-01")).toEqual([]);
  });

  it("nextMonthlyPeriod follows the previous end", () => {
    expect(nextMonthlyPeriod("2026-01-01", "2026-01-31")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });
});
