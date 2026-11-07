import type { StageCategory, RolloverPolicy, PackageType } from "@prisma/client";
import { addDaysPlain, addIntervalPlain, type PlainDate } from "../dates";

export const CATEGORY_ORDER: StageCategory[] = ["PLANNED", "FILMED", "EDITING", "AWAITING_APPROVAL", "APPROVED", "DELIVERED"];

export const CATEGORY_LABEL: Record<StageCategory, string> = {
  PLANNED: "Planned",
  FILMED: "Filmed",
  EDITING: "Editing",
  AWAITING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved",
  DELIVERED: "Delivered",
};

export type ProgressVideo = { category: StageCategory; isExtra: boolean };

export type PeriodProgress = {
  included: number; // videosIncluded + rolledOverIn
  counts: Record<StageCategory, number>; // in-package videos only, each video counted once
  assigned: number; // in-package videos linked to the period
  delivered: number;
  approvedNotDelivered: number;
  completed: number; // approved + delivered (work finished)
  remaining: number; // still owed to the client = included - delivered
  unplanned: number; // included slots without any video record yet
  overage: number; // in-package videos beyond the included amount
  extras: number; // videos explicitly marked as outside the package
  extrasDelivered: number;
  pctDelivered: number; // 0..100
  pctCompleted: number;
};

/**
 * Package progress. Every video has exactly one stage, so each is counted
 * in exactly one category — no double counting. "Completed" (approved) is
 * kept distinct from "delivered".
 */
export function computePeriodProgress(
  period: { videosIncluded: number; rolledOverIn: number },
  videos: ProgressVideo[],
): PeriodProgress {
  const counts = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0])) as Record<StageCategory, number>;
  let extras = 0;
  let extrasDelivered = 0;
  for (const v of videos) {
    if (v.isExtra) {
      extras++;
      if (v.category === "DELIVERED") extrasDelivered++;
      continue;
    }
    counts[v.category]++;
  }
  const included = Math.max(0, period.videosIncluded + period.rolledOverIn);
  const assigned = CATEGORY_ORDER.reduce((s, c) => s + counts[c], 0);
  const delivered = counts.DELIVERED;
  const approvedNotDelivered = counts.APPROVED;
  const completed = delivered + approvedNotDelivered;
  const remaining = Math.max(0, included - delivered);
  const unplanned = Math.max(0, included - assigned);
  const overage = Math.max(0, assigned - included);
  const pct = (n: number) => (included === 0 ? (n > 0 ? 100 : 0) : Math.min(100, Math.round((n / included) * 100)));
  return {
    included,
    counts,
    assigned,
    delivered,
    approvedNotDelivered,
    completed,
    remaining,
    unplanned,
    overage,
    extras,
    extrasDelivered,
    pctDelivered: pct(delivered),
    pctCompleted: pct(completed),
  };
}

/** Number of undelivered videos that carry over into the next period. */
export function computeRollover(policy: RolloverPolicy, cap: number | null | undefined, progress: Pick<PeriodProgress, "remaining">) {
  if (policy === "NONE") return 0;
  if (policy === "ROLLOVER_ALL") return progress.remaining;
  return Math.min(progress.remaining, Math.max(0, cap ?? 0));
}

/** Only monthly retainers generate recurring periods. */
export function isRecurring(type: PackageType) {
  return type === "MONTHLY_RETAINER";
}

/** The period following one that ends on `prevEnd` (monthly cadence anchored to the package start day). */
export function nextMonthlyPeriod(packageStart: PlainDate, prevEnd: PlainDate) {
  const start = addDaysPlain(prevEnd, 1);
  return { start, end: monthlyPeriodEnd(packageStart, start) };
}

/** End of the monthly period that starts on `start`, anchored to the package start day-of-month. */
export function monthlyPeriodEnd(packageStart: PlainDate, start: PlainDate) {
  // Count months between package start and this start, then go one month further.
  const [ps, s] = [packageStart, start].map((d) => d.split("-").map(Number));
  const monthsFromStart = (s[0] - ps[0]) * 12 + (s[1] - ps[1]);
  const nextAnchor = addIntervalPlain(packageStart, "MONTHLY", monthsFromStart + 1);
  return addDaysPlain(nextAnchor, -1);
}

/** Generates all periods needed so that the period covering `today` exists. */
export function periodsToCreate(
  pkg: { startDate: PlainDate; endDate: PlainDate | null },
  lastPeriodEnd: PlainDate | null,
  today: PlainDate,
  maxPeriods = 24,
) {
  const out: { start: PlainDate; end: PlainDate }[] = [];
  let start = lastPeriodEnd ? addDaysPlain(lastPeriodEnd, 1) : pkg.startDate;
  while (start <= today && out.length < maxPeriods) {
    if (pkg.endDate && start > pkg.endDate) break;
    let end = monthlyPeriodEnd(pkg.startDate, start);
    if (pkg.endDate && end > pkg.endDate) end = pkg.endDate;
    out.push({ start, end });
    start = addDaysPlain(end, 1);
  }
  return out;
}

export const PACKAGE_TYPE_LABEL: Record<PackageType, string> = {
  MONTHLY_RETAINER: "Monthly retainer",
  ONE_OFF: "One-off project",
  EVENT: "Event coverage",
  BUNDLE: "Custom bundle",
  HOURLY: "Hourly",
  BARTER: "Barter",
};

export const ROLLOVER_LABEL: Record<RolloverPolicy, string> = {
  NONE: "No rollover",
  ROLLOVER_ALL: "Roll over all unused",
  ROLLOVER_CAPPED: "Roll over up to a cap",
};
