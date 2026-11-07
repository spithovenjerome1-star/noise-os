import { describe, expect, it } from "vitest";
import { classifyDeadlines, dedupeKey, findDuplicateTasks, normalizeTitle, previousMonth, daysWaiting } from "@/lib/domain/automations";
import { canChangeOwnerState } from "@/lib/domain/team";
import { layoutColumns, maltaParts, shiftAnchor, viewRange, weekdayMon0 } from "@/lib/calendar";

describe("dedupeKey", () => {
  it("joins parts and marks missing ones", () => {
    expect(dedupeKey("video-overdue", "v1", "2026-11-01")).toBe("video-overdue:v1:2026-11-01");
    expect(dedupeKey("x", null, undefined, 3)).toBe("x:-:-:3");
  });
});

describe("classifyDeadlines", () => {
  const today = "2026-11-10";
  const videos = [
    { id: "a", deadline: "2026-11-10", delivered: false }, // today → approaching 0
    { id: "b", deadline: "2026-11-12", delivered: false }, // in 2 days
    { id: "c", deadline: "2026-11-13", delivered: false }, // outside window
    { id: "d", deadline: "2026-11-08", delivered: false }, // 2 days late
    { id: "e", deadline: "2026-11-01", delivered: true }, // delivered: ignored
    { id: "f", deadline: null, delivered: false },
  ];
  it("splits approaching and overdue using the warning window", () => {
    const { approaching, overdue } = classifyDeadlines(videos, today, 2);
    expect(approaching.map((v) => [v.id, v.daysLeft])).toEqual([["a", 0], ["b", 2]]);
    expect(overdue.map((v) => [v.id, v.daysLate])).toEqual([["d", 2]]);
  });
  it("handles a zero-day window", () => {
    expect(classifyDeadlines(videos, today, 0).approaching.map((v) => v.id)).toEqual(["a"]);
  });
});

describe("duplicate tasks", () => {
  it("normalizes case, accents and punctuation", () => {
    expect(normalizeTitle("  Édit   Reel #3!! ")).toBe("edit reel 3");
  });
  it("groups only same title + client + due date", () => {
    const tasks = [
      { id: "1", title: "Send invoice", clientId: "c1", dueDate: "2026-11-10" },
      { id: "2", title: "send invoice.", clientId: "c1", dueDate: "2026-11-10" },
      { id: "3", title: "Send invoice", clientId: "c2", dueDate: "2026-11-10" },
      { id: "4", title: "Send invoice", clientId: "c1", dueDate: "2026-11-11" },
      { id: "5", title: "!!!", clientId: null, dueDate: null },
      { id: "6", title: "???", clientId: null, dueDate: null },
    ];
    const groups = findDuplicateTasks(tasks);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items.map((t) => t.id)).toEqual(["1", "2"]);
  });
});

describe("dates for rules", () => {
  it("previous month wraps the year", () => {
    expect(previousMonth("2026-01-01")).toBe("2025-12");
    expect(previousMonth("2026-11-07")).toBe("2026-10");
  });
  it("days waiting is never negative", () => {
    expect(daysWaiting("2026-11-01", "2026-11-07")).toBe(6);
    expect(daysWaiting("2026-11-09", "2026-11-07")).toBe(0);
  });
});

describe("team owner guard", () => {
  it("blocks demoting or deactivating the last owner", () => {
    expect(canChangeOwnerState({ target: { role: "OWNER", active: true }, next: { role: "ADMIN", active: true }, activeOwners: 1 }).ok).toBe(false);
    expect(canChangeOwnerState({ target: { role: "OWNER", active: true }, next: { role: "OWNER", active: false }, activeOwners: 1 }).ok).toBe(false);
  });
  it("allows it when another owner exists, and allows other changes", () => {
    expect(canChangeOwnerState({ target: { role: "OWNER", active: true }, next: { role: "ADMIN", active: true }, activeOwners: 2 }).ok).toBe(true);
    expect(canChangeOwnerState({ target: { role: "MEMBER", active: true }, next: { role: "MEMBER", active: false }, activeOwners: 1 }).ok).toBe(true);
  });
});

describe("calendar helpers", () => {
  it("weeks start on Monday", () => {
    expect(weekdayMon0("2026-11-09")).toBe(0); // Monday
    expect(weekdayMon0("2026-11-08")).toBe(6); // Sunday
  });
  it("month view covers 6 full weeks starting on Monday", () => {
    const r = viewRange("month", "2026-11-15");
    expect(r).toEqual({ start: "2026-10-26", end: "2026-12-07" });
  });
  it("shifts months across year boundaries", () => {
    expect(shiftAnchor("month", "2026-12-20", 1)).toBe("2027-01-01");
    expect(shiftAnchor("month", "2026-01-05", -1)).toBe("2025-12-01");
    expect(shiftAnchor("week", "2026-11-09", -1)).toBe("2026-11-02");
  });
  it("converts moments to Malta local time, including DST", () => {
    expect(maltaParts(new Date("2026-07-01T08:30:00Z"))).toEqual({ date: "2026-07-01", minutes: 10 * 60 + 30 }); // CEST +2
    expect(maltaParts(new Date("2026-12-31T23:30:00Z"))).toEqual({ date: "2027-01-01", minutes: 30 }); // CET +1
  });
  it("lays overlapping events side by side", () => {
    const out = layoutColumns([
      { id: "a", startMin: 540, endMin: 600 },
      { id: "b", startMin: 570, endMin: 630 },
      { id: "c", startMin: 660, endMin: 720 },
    ]);
    const by = Object.fromEntries(out.map((o) => [o.id, [o.col, o.cols]]));
    expect(by).toEqual({ a: [0, 2], b: [1, 2], c: [0, 1] });
  });
});
