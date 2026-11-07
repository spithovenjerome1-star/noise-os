import { addDaysPlain, daysBetween, type PlainDate } from "../dates";
import type { StageCategory } from "@prisma/client";

/** Turnaround days precedence: package → client → global default (default 7). */
export function resolveTurnaroundDays(opts: {
  packageDays?: number | null;
  clientDays?: number | null;
  defaultDays: number;
}) {
  for (const v of [opts.packageDays, opts.clientDays]) if (typeof v === "number" && v >= 0) return v;
  return opts.defaultDays;
}

export function computeDeadline(filmedOn: PlainDate, turnaroundDays: number): PlainDate {
  return addDaysPlain(filmedOn, turnaroundDays);
}

/**
 * Decide the deadline after a video update. Manual overrides always win;
 * otherwise the deadline follows the filming date.
 */
export function nextDeadline(opts: {
  filmedOn: PlainDate | null;
  manualDeadline: PlainDate | null;
  overridden: boolean;
  turnaroundDays: number;
}): { deadline: PlainDate | null; overridden: boolean } {
  if (opts.overridden && opts.manualDeadline) return { deadline: opts.manualDeadline, overridden: true };
  if (opts.filmedOn) return { deadline: computeDeadline(opts.filmedOn, opts.turnaroundDays), overridden: false };
  return { deadline: opts.manualDeadline, overridden: Boolean(opts.manualDeadline) };
}

export type DeadlineState = "none" | "done" | "ok" | "soon" | "today" | "overdue";

export function deadlineState(
  deadline: PlainDate | null,
  category: StageCategory,
  today: PlainDate,
  warningDays = 2,
): DeadlineState {
  if (category === "DELIVERED") return "done";
  if (!deadline) return "none";
  const diff = daysBetween(today, deadline);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff <= warningDays) return "soon";
  return "ok";
}
