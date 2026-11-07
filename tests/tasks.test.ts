import { describe, expect, it } from "vitest";
import { dueBucket, nextOccurrenceDue, positionBetween, taskInView } from "@/lib/domain/tasks";

describe("recurring tasks", () => {
  it("does not repeat when recurrence is NONE", () => {
    expect(nextOccurrenceDue("NONE", "2026-11-07", "2026-11-07")).toBeNull();
  });
  it("anchors on the due date", () => {
    expect(nextOccurrenceDue("WEEKLY", "2026-11-02", "2026-11-03")).toBe("2026-11-09");
    expect(nextOccurrenceDue("DAILY", "2026-11-07", "2026-11-07")).toBe("2026-11-08");
    expect(nextOccurrenceDue("YEARLY", "2026-11-07", "2026-11-07")).toBe("2027-11-07");
  });
  it("clamps month-end correctly", () => {
    expect(nextOccurrenceDue("MONTHLY", "2026-01-31", "2026-01-31")).toBe("2026-02-28");
  });
  it("skips forward when completed very late (never creates a past due date)", () => {
    expect(nextOccurrenceDue("WEEKLY", "2026-10-01", "2026-11-07")).toBe("2026-11-12");
  });
  it("uses the completion date when there was no due date", () => {
    expect(nextOccurrenceDue("MONTHLY", null, "2026-11-07")).toBe("2026-12-07");
  });
});

describe("smart views", () => {
  const today = "2026-11-07";
  const t = (o: Partial<Parameters<typeof taskInView>[0]>) => ({ status: "TODO" as const, dueDate: null, ...o });
  it("today includes overdue and due today, not done", () => {
    expect(taskInView(t({ dueDate: "2026-11-07" }), "today", today)).toBe(true);
    expect(taskInView(t({ dueDate: "2026-11-01" }), "today", today)).toBe(true);
    expect(taskInView(t({ dueDate: "2026-11-08" }), "today", today)).toBe(false);
    expect(taskInView(t({ dueDate: "2026-11-07", status: "DONE" }), "today", today)).toBe(false);
  });
  it("week covers the next 7 days", () => {
    expect(taskInView(t({ dueDate: "2026-11-13" }), "week", today)).toBe(true);
    expect(taskInView(t({ dueDate: "2026-11-14" }), "week", today)).toBe(false);
  });
  it("overdue is strictly before today", () => {
    expect(taskInView(t({ dueDate: "2026-11-06" }), "overdue", today)).toBe(true);
    expect(taskInView(t({ dueDate: "2026-11-07" }), "overdue", today)).toBe(false);
  });
  it("waiting and editing queue", () => {
    expect(taskInView(t({ status: "WAITING_CLIENT" }), "waiting", today)).toBe(true);
    expect(taskInView(t({ videoCategory: "EDITING" }), "editing", today)).toBe(true);
    expect(taskInView(t({ status: "IN_PROGRESS", hasVideo: true }), "editing", today)).toBe(true);
    expect(taskInView(t({ status: "IN_PROGRESS", hasVideo: false }), "editing", today)).toBe(false);
  });
  it("all includes done", () => {
    expect(taskInView(t({ status: "DONE" }), "all", today)).toBe(true);
  });
});

describe("buckets and ordering", () => {
  it("groups by due date", () => {
    const today = "2026-11-07";
    expect(dueBucket("2026-11-01", "TODO", today)).toBe("Overdue");
    expect(dueBucket("2026-11-07", "TODO", today)).toBe("Today");
    expect(dueBucket("2026-11-10", "TODO", today)).toBe("This week");
    expect(dueBucket("2026-12-10", "TODO", today)).toBe("Later");
    expect(dueBucket(null, "TODO", today)).toBe("No due date");
    expect(dueBucket("2026-11-01", "DONE", today)).toBe("Done");
  });
  it("computes positions between neighbours", () => {
    expect(positionBetween(null, null)).toBe(1000);
    expect(positionBetween(1000, null)).toBe(2000);
    expect(positionBetween(null, 1000)).toBe(0);
    expect(positionBetween(1000, 2000)).toBe(1500);
  });
});
