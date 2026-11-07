// Calendar helpers (pure). All grids are in Europe/Malta local dates; weeks start on Monday.
import { addDaysPlain, daysBetween, TZ, type PlainDate } from "./dates";

export type CalView = "month" | "week" | "day";

/** Day of week, Monday = 0 … Sunday = 6. */
export function weekdayMon0(p: PlainDate) {
  const d = new Date(`${p}T00:00:00Z`).getUTCDay();
  return (d + 6) % 7;
}

export function startOfWeek(p: PlainDate) {
  return addDaysPlain(p, -weekdayMon0(p));
}

/** Visible range [start, endExclusive) for a view anchored on `anchor`. */
export function viewRange(view: CalView, anchor: PlainDate) {
  if (view === "day") return { start: anchor, end: addDaysPlain(anchor, 1) };
  if (view === "week") {
    const s = startOfWeek(anchor);
    return { start: s, end: addDaysPlain(s, 7) };
  }
  const first = anchor.slice(0, 8) + "01";
  const s = startOfWeek(first);
  // Always 6 weeks for a stable grid height
  return { start: s, end: addDaysPlain(s, 42) };
}

export function shiftAnchor(view: CalView, anchor: PlainDate, dir: -1 | 1) {
  if (view === "day") return addDaysPlain(anchor, dir);
  if (view === "week") return addDaysPlain(anchor, 7 * dir);
  const [y, m] = anchor.split("-").map(Number);
  const nm = m + dir;
  const ny = nm === 0 ? y - 1 : nm === 13 ? y + 1 : y;
  const mm = nm === 0 ? 12 : nm === 13 ? 1 : nm;
  return `${ny}-${String(mm).padStart(2, "0")}-01`;
}

export function daysIn(start: PlainDate, endExclusive: PlainDate) {
  const n = daysBetween(start, endExclusive);
  return Array.from({ length: n }, (_, i) => addDaysPlain(start, i));
}

const partsFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Malta-local date and minutes-since-midnight of a moment. */
export function maltaParts(d: Date): { date: PlainDate; minutes: number } {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

export type TimedItem = { id: string; startMin: number; endMin: number };

/** Assign overlapping timed items to side-by-side columns (greedy). */
export function layoutColumns<T extends TimedItem>(items: T[]) {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const out: (T & { col: number; cols: number })[] = [];
  let cluster: (T & { col: number; cols: number })[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((c) => c.col + 1));
    cluster.forEach((c) => (c.cols = cols));
    out.push(...cluster);
    cluster = [];
  };
  for (const it of sorted) {
    if (cluster.length && it.startMin >= clusterEnd) {
      flush();
      clusterEnd = -1;
    }
    const used = new Set(cluster.filter((c) => c.endMin > it.startMin).map((c) => c.col));
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ ...it, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, it.endMin);
  }
  flush();
  return out;
}

/** True if [aStart, aEnd) overlaps [bStart, bEnd). */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}
