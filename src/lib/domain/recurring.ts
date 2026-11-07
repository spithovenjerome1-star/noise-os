import { addIntervalPlain, type PlainDate } from "../dates";

export type RecurringInterval = "WEEKLY" | "MONTHLY" | "YEARLY";

/**
 * Occurrence dates that are due (<= today) starting at nextDate, respecting endDate.
 * Returns the dates plus the next date after the last due occurrence.
 */
export function dueOccurrences(
  tpl: { nextDate: PlainDate; interval: RecurringInterval; endDate: PlainDate | null },
  today: PlainDate,
  max = 60,
): { dates: PlainDate[]; nextDate: PlainDate; finished: boolean } {
  const dates: PlainDate[] = [];
  let d = tpl.nextDate;
  let i = 0;
  // Anchor on the original next date so month-end dates don't drift (31 Jan → 28 Feb → 31 Mar).
  while (d <= today && dates.length < max) {
    if (tpl.endDate && d > tpl.endDate) break;
    dates.push(d);
    i++;
    d = addIntervalPlain(tpl.nextDate, tpl.interval, i);
  }
  const finished = Boolean(tpl.endDate && d > tpl.endDate);
  return { dates, nextDate: d, finished };
}

/** Outstanding ageing buckets (days past due). */
export function ageBucket(daysOverdue: number): "current" | "d1_30" | "d31_60" | "d60p" {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "d1_30";
  if (daysOverdue <= 60) return "d31_60";
  return "d60p";
}

/** CSV cell escaping (RFC 4180) with spreadsheet formula-injection guard. */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]) {
  return "﻿" + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
