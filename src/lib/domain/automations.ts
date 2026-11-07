// Pure helpers used by the automation rules (unit tested).
import { daysBetween, type PlainDate } from "../dates";

export function dedupeKey(rule: string, ...parts: (string | number | null | undefined)[]) {
  return [rule, ...parts.map((p) => (p === null || p === undefined ? "-" : String(p)))].join(":");
}

export type DeadlineVideo = { id: string; deadline: PlainDate | null; delivered: boolean };

/** Split undelivered videos with deadlines into approaching (0..warningDays) and overdue (<0). */
export function classifyDeadlines<T extends DeadlineVideo>(videos: T[], today: PlainDate, warningDays: number) {
  const approaching: (T & { daysLeft: number })[] = [];
  const overdue: (T & { daysLate: number })[] = [];
  for (const v of videos) {
    if (v.delivered || !v.deadline) continue;
    const diff = daysBetween(today, v.deadline);
    if (diff < 0) overdue.push({ ...v, daysLate: -diff });
    else if (diff <= warningDays) approaching.push({ ...v, daysLeft: diff });
  }
  return { approaching, overdue };
}

export function normalizeTitle(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Groups of open tasks that look like duplicates (same normalized title + client + due date). */
export function findDuplicateTasks<T extends { id: string; title: string; clientId: string | null; dueDate: PlainDate | null }>(tasks: T[]) {
  const groups = new Map<string, T[]>();
  for (const t of tasks) {
    const n = normalizeTitle(t.title);
    if (!n) continue;
    const key = `${n}|${t.clientId ?? ""}|${t.dueDate ?? ""}`;
    const g = groups.get(key) ?? [];
    g.push(t);
    groups.set(key, g);
  }
  return [...groups.entries()].filter(([, g]) => g.length > 1).map(([key, items]) => ({ key, items }));
}

/** Whole days an item has been waiting since `since` (a moment) as of `today`. */
export function daysWaiting(since: PlainDate, today: PlainDate) {
  return Math.max(0, daysBetween(since, today));
}

/** The month (YYYY-MM) preceding the month of `today`. */
export function previousMonth(today: PlainDate) {
  const [y, m] = today.split("-").map(Number);
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return `${py}-${String(pm).padStart(2, "0")}`;
}
