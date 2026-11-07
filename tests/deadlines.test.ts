import { describe, expect, it } from "vitest";
import { computeDeadline, deadlineState, nextDeadline, resolveTurnaroundDays } from "@/lib/domain/deadlines";

describe("turnaround resolution", () => {
  it("defaults to the global rule (7 days)", () => {
    expect(resolveTurnaroundDays({ defaultDays: 7 })).toBe(7);
  });
  it("prefers package, then client", () => {
    expect(resolveTurnaroundDays({ packageDays: 3, clientDays: 5, defaultDays: 7 })).toBe(3);
    expect(resolveTurnaroundDays({ packageDays: null, clientDays: 5, defaultDays: 7 })).toBe(5);
    expect(resolveTurnaroundDays({ packageDays: 0, clientDays: 5, defaultDays: 7 })).toBe(0);
  });
});

describe("deadline calculation", () => {
  it("is filming date + 7 calendar days", () => {
    expect(computeDeadline("2026-11-02", 7)).toBe("2026-11-09");
  });
  it("crosses month and year boundaries", () => {
    expect(computeDeadline("2026-12-28", 7)).toBe("2027-01-04");
    expect(computeDeadline("2028-02-25", 7)).toBe("2028-03-03"); // leap year
  });
  it("is not affected by the Malta DST change (calendar days)", () => {
    expect(computeDeadline("2026-10-22", 7)).toBe("2026-10-29"); // DST ends 25 Oct
    expect(computeDeadline("2026-03-26", 7)).toBe("2026-04-02"); // DST starts 29 Mar
  });
});

describe("nextDeadline", () => {
  it("follows the filming date when not overridden", () => {
    expect(nextDeadline({ filmedOn: "2026-11-02", manualDeadline: "2026-12-01", overridden: false, turnaroundDays: 7 })).toEqual({ deadline: "2026-11-09", overridden: false });
  });
  it("keeps a manual override", () => {
    expect(nextDeadline({ filmedOn: "2026-11-02", manualDeadline: "2026-11-20", overridden: true, turnaroundDays: 7 })).toEqual({ deadline: "2026-11-20", overridden: true });
  });
  it("falls back to auto when override is set without a date", () => {
    expect(nextDeadline({ filmedOn: "2026-11-02", manualDeadline: null, overridden: true, turnaroundDays: 7 }).deadline).toBe("2026-11-09");
  });
  it("keeps a manual date when nothing is filmed yet", () => {
    expect(nextDeadline({ filmedOn: null, manualDeadline: "2026-11-30", overridden: false, turnaroundDays: 7 }).deadline).toBe("2026-11-30");
    expect(nextDeadline({ filmedOn: null, manualDeadline: null, overridden: false, turnaroundDays: 7 }).deadline).toBeNull();
  });
});

describe("deadline state", () => {
  const today = "2026-11-07";
  it("flags overdue, today, soon and ok", () => {
    expect(deadlineState("2026-11-06", "EDITING", today, 2)).toBe("overdue");
    expect(deadlineState("2026-11-07", "EDITING", today, 2)).toBe("today");
    expect(deadlineState("2026-11-09", "EDITING", today, 2)).toBe("soon");
    expect(deadlineState("2026-11-10", "EDITING", today, 2)).toBe("ok");
  });
  it("is done once delivered, even if past due", () => {
    expect(deadlineState("2026-11-01", "DELIVERED", today, 2)).toBe("done");
  });
  it("is none without a deadline", () => {
    expect(deadlineState(null, "PLANNED", today, 2)).toBe("none");
  });
  it("approved-but-not-delivered can still be overdue", () => {
    expect(deadlineState("2026-11-01", "APPROVED", today, 2)).toBe("overdue");
  });
});
