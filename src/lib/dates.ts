// Business time lives in Europe/Malta. Moments are stored as UTC timestamps.
// Calendar dates (deadlines, invoice dates) are stored as @db.Date which Prisma
// returns as a Date at 00:00 UTC — we treat those as "plain dates" (YYYY-MM-DD).
import { TZDate } from "@date-fns/tz";
import { addDays, addMonths, addWeeks, addYears, format, parseISO, differenceInCalendarDays } from "date-fns";

export const TZ = "Europe/Malta";

/** A plain calendar date string YYYY-MM-DD. */
export type PlainDate = string;

/** Today's date in Malta as YYYY-MM-DD. */
export function todayMalta(now: Date = new Date()): PlainDate {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Convert a moment to its Malta calendar date. */
export function maltaDateOf(moment: Date): PlainDate {
  return todayMalta(moment);
}

/** Convert a @db.Date value (UTC midnight) to YYYY-MM-DD. */
export function plainOf(d: Date | null | undefined): PlainDate | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

/** Convert YYYY-MM-DD to a Date suitable for a @db.Date column. */
export function dbDate(p: PlainDate): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p)) throw new Error(`Invalid date: ${p}`);
  return new Date(`${p}T00:00:00.000Z`);
}

export function dbDateOrNull(p: string | null | undefined): Date | null {
  if (!p) return null;
  return dbDate(p);
}

export function addDaysPlain(p: PlainDate, days: number): PlainDate {
  return plainOf(addDays(dbDate(p), days))!;
}

export function addIntervalPlain(p: PlainDate, interval: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY", n = 1): PlainDate {
  const d = dbDate(p);
  const r =
    interval === "DAILY" ? addDays(d, n) : interval === "WEEKLY" ? addWeeks(d, n) : interval === "MONTHLY" ? addMonths(d, n) : addYears(d, n);
  return plainOf(r)!;
}

/** Days from a to b (b - a) in calendar days. */
export function daysBetween(a: PlainDate, b: PlainDate) {
  return differenceInCalendarDays(dbDate(b), dbDate(a));
}

export function startOfMonthPlain(p: PlainDate): PlainDate {
  return p.slice(0, 7) + "-01";
}

export function endOfMonthPlain(p: PlainDate): PlainDate {
  const next = addMonths(dbDate(startOfMonthPlain(p)), 1);
  return plainOf(addDays(next, -1))!;
}

export function monthKey(p: PlainDate) {
  return p.slice(0, 7);
}

/** Interpret a Malta local "YYYY-MM-DDTHH:mm" as a UTC Date. */
export function maltaLocalToUtc(local: string): Date {
  const [d, t = "00:00"] = local.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  return new Date(new TZDate(y, m - 1, day, hh, mm, 0, TZ).getTime());
}

/** Format a UTC Date as Malta local "YYYY-MM-DDTHH:mm" for <input type=datetime-local>. */
export function utcToMaltaLocalInput(d: Date | null | undefined): string {
  if (!d) return "";
  const z = new TZDate(d.getTime(), TZ);
  return format(z, "yyyy-MM-dd'T'HH:mm");
}

/** Malta-local start/end of a plain date as UTC instants. */
export function maltaDayRange(p: PlainDate) {
  const start = maltaLocalToUtc(`${p}T00:00`);
  const end = maltaLocalToUtc(`${addDaysPlain(p, 1)}T00:00`);
  return { start, end };
}

export function fmtDate(d: Date | PlainDate | null | undefined, pattern = "d MMM yyyy") {
  if (!d) return "—";
  const date = typeof d === "string" ? parseISO(d) : d;
  return format(date, pattern);
}

/** Format a moment in Malta time. */
export function fmtMoment(d: Date | null | undefined, pattern = "d MMM yyyy, HH:mm") {
  if (!d) return "—";
  return format(new TZDate(d.getTime(), TZ), pattern);
}

export function relativeDays(target: PlainDate, today: PlainDate = todayMalta()) {
  const diff = daysBetween(today, target);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return `In ${diff} days`;
  if (diff < -1 && diff > -30) return `${-diff} days ago`;
  return fmtDate(target, "d MMM");
}

export function timeAgo(d: Date, now = new Date()) {
  const s = Math.round((now.getTime() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return fmtMoment(d, "d MMM yyyy");
}
