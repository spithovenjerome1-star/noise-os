import { endOfMonthPlain, fmtDate, todayMalta, type PlainDate } from "@/lib/dates";

/** period param: "YYYY-MM" (month), "YYYY" (year) or "all". */
export function resolvePeriod(param: string | undefined, fallback: "month" | "all" = "month") {
  const today = todayMalta();
  let p = param ?? (fallback === "month" ? today.slice(0, 7) : "all");
  if (!/^\d{4}(-\d{2})?$/.test(p) && p !== "all") p = "all";
  if (p === "all") return { key: "all", kind: "all" as const, from: null as PlainDate | null, to: null as PlainDate | null, label: "All time" };
  if (p.length === 4) return { key: p, kind: "year" as const, from: `${p}-01-01`, to: `${p}-12-31`, label: p };
  return { key: p, kind: "month" as const, from: `${p}-01`, to: endOfMonthPlain(`${p}-01`), label: fmtDate(`${p}-01`, "MMMM yyyy") };
}

export function shiftPeriod(key: string, dir: -1 | 1) {
  if (key.length === 4) return String(Number(key) + dir);
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + dir, 1));
  return d.toISOString().slice(0, 7);
}
