import { describe, it, expect } from "vitest";
import { clientHealth, type HealthInput } from "@/lib/domain/health";

const base: HealthInput = {
  status: "ACTIVE",
  overdueInvoices: 0,
  overdueCents: 0,
  avgDaysLate: 2,
  revisionRatio: 0.1,
  hoursLogged: 10,
  revenueCents: 100000,
  daysSinceActivity: 3,
};

describe("clientHealth", () => {
  it("is healthy when paying and workload is balanced", () => {
    const h = clientHealth(base);
    expect(h.level).toBe("healthy");
  });
  it("flags overdue invoices", () => {
    expect(clientHealth({ ...base, overdueInvoices: 1, overdueCents: 20000 }).level).toBe("watch");
    expect(clientHealth({ ...base, overdueInvoices: 2, overdueCents: 20000, avgDaysLate: 30 }).level).toBe("at-risk");
  });
  it("flags workload vs revenue", () => {
    const h = clientHealth({ ...base, hoursLogged: 50, revenueCents: 50000 });
    expect(h.reasons.some((r) => r.includes("workload"))).toBe(true);
    expect(h.level).toBe("watch");
  });
  it("ignores hours when too few are logged", () => {
    expect(clientHealth({ ...base, hoursLogged: 2, revenueCents: 0 }).level).toBe("healthy");
  });
  it("flags frequent revisions and inactivity", () => {
    const h = clientHealth({ ...base, revisionRatio: 0.8, daysSinceActivity: 45 });
    expect(h.level).toBe("watch");
    expect(h.reasons).toHaveLength(2);
  });
  it("does not score leads or former clients", () => {
    expect(clientHealth({ ...base, status: "LEAD", overdueInvoices: 3 }).level).toBe("healthy");
  });
});
