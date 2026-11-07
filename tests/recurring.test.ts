import { describe, expect, it } from "vitest";
import { dueOccurrences, ageBucket, csvCell, toCsv } from "@/lib/domain/recurring";

describe("dueOccurrences", () => {
  it("returns nothing when the next date is in the future", () => {
    expect(dueOccurrences({ nextDate: "2026-12-01", interval: "MONTHLY", endDate: null }, "2026-11-07")).toEqual({ dates: [], nextDate: "2026-12-01", finished: false });
  });
  it("catches up missed monthly periods and advances", () => {
    const r = dueOccurrences({ nextDate: "2026-08-15", interval: "MONTHLY", endDate: null }, "2026-11-07");
    expect(r.dates).toEqual(["2026-08-15", "2026-09-15", "2026-10-15"]);
    expect(r.nextDate).toBe("2026-11-15");
  });
  it("includes today", () => {
    expect(dueOccurrences({ nextDate: "2026-11-07", interval: "WEEKLY", endDate: null }, "2026-11-07").dates).toEqual(["2026-11-07"]);
  });
  it("does not drift on month-end dates", () => {
    const r = dueOccurrences({ nextDate: "2026-01-31", interval: "MONTHLY", endDate: null }, "2026-04-30");
    expect(r.dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });
  it("respects the end date and reports finished", () => {
    const r = dueOccurrences({ nextDate: "2026-01-01", interval: "MONTHLY", endDate: "2026-03-01" }, "2026-11-07");
    expect(r.dates).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
    expect(r.finished).toBe(true);
  });
  it("handles yearly", () => {
    expect(dueOccurrences({ nextDate: "2025-03-01", interval: "YEARLY", endDate: null }, "2026-11-07").dates).toEqual(["2025-03-01", "2026-03-01"]);
  });
});

describe("ageBucket", () => {
  it("buckets days overdue", () => {
    expect(ageBucket(0)).toBe("current");
    expect(ageBucket(1)).toBe("d1_30");
    expect(ageBucket(30)).toBe("d1_30");
    expect(ageBucket(31)).toBe("d31_60");
    expect(ageBucket(61)).toBe("d60p");
  });
});

describe("CSV", () => {
  it("escapes quotes, commas, newlines and guards formulas", () => {
    expect(csvCell('He said "hi", ok')).toBe('"He said ""hi"", ok"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("-20.00")).toBe("-20.00");
    expect(csvCell(null)).toBe("");
  });
  it("adds a BOM and CRLF rows", () => {
    expect(toCsv(["a", "b"], [[1, 2]])).toBe("﻿a,b\r\n1,2\r\n");
  });
});
