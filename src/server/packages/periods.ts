import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { addIntervalPlain, addDaysPlain, dbDate, plainOf, todayMalta, type PlainDate } from "@/lib/dates";
import { computePeriodProgress, computeRollover, isRecurring, monthlyPeriodEnd, periodsToCreate } from "@/lib/domain/packages";

type Tx = Prisma.TransactionClient | typeof db;

/** Progress of a period from its linked videos. */
export async function periodProgress(periodId: string, tx: Tx = db) {
  const p = await tx.packagePeriod.findUniqueOrThrow({
    where: { id: periodId },
    include: { videos: { select: { isExtra: true, stage: { select: { category: true } } } } },
  });
  return computePeriodProgress(p, p.videos.map((v) => ({ isExtra: v.isExtra, category: v.stage.category })));
}

/** End date for the single period of a non-recurring package. */
export function singlePeriodEnd(start: PlainDate, end: PlainDate | null) {
  return end ?? addDaysPlain(addIntervalPlain(start, "YEARLY"), -1);
}

/**
 * Ensure the period structure of one package is complete up to `today`.
 * Recurring: create missing monthly periods, close ended ones, carry rollover.
 * Non-recurring: exactly one period spanning the package.
 */
export async function ensurePeriodsForPackage(packageId: string, today: PlainDate = todayMalta()) {
  let created = 0;
  let closed = 0;
  const pkg = await db.servicePackage.findUnique({ where: { id: packageId }, include: { periods: { orderBy: { startDate: "asc" } } } });
  if (!pkg) return { created, closed };
  const start = plainOf(pkg.startDate)!;
  const end = plainOf(pkg.endDate);

  if (!isRecurring(pkg.type)) {
    if (pkg.periods.length === 0) {
      await db.packagePeriod.create({
        data: { packageId: pkg.id, startDate: dbDate(start), endDate: dbDate(singlePeriodEnd(start, end)), videosIncluded: pkg.videosIncluded ?? 0 },
      });
      created++;
    }
    return { created, closed };
  }

  if (!pkg.active) return { created, closed };
  const last = pkg.periods.at(-1);
  // Without auto-renew only the first period is created automatically; later ones are manual.
  const toCreate = periodsToCreate({ startDate: start, endDate: end }, last ? plainOf(last.endDate) : null, today);
  let limited = pkg.autoRenew ? toCreate : last ? [] : toCreate.slice(0, 1);
  // A package starting in the future still gets its first period so work can be planned against it.
  if (!last && limited.length === 0) {
    let firstEnd = monthlyPeriodEnd(start, start);
    if (end && firstEnd > end) firstEnd = end;
    limited = [{ start, end: firstEnd }];
  }

  for (const range of limited) {
    await db.$transaction(async (tx) => {
      const prev = await tx.packagePeriod.findFirst({ where: { packageId: pkg.id, startDate: { lt: dbDate(range.start) } }, orderBy: { startDate: "desc" } });
      let rolledOverIn = 0;
      if (prev) {
        const prog = await periodProgress(prev.id, tx);
        rolledOverIn = computeRollover(pkg.rolloverPolicy, pkg.rolloverCap, prog);
        if (prev.status === "OPEN") {
          await tx.packagePeriod.update({ where: { id: prev.id }, data: { status: "CLOSED", closedAt: new Date() } });
          closed++;
        }
      }
      const exists = await tx.packagePeriod.findUnique({ where: { packageId_startDate: { packageId: pkg.id, startDate: dbDate(range.start) } } });
      if (!exists) {
        await tx.packagePeriod.create({
          data: { packageId: pkg.id, startDate: dbDate(range.start), endDate: dbDate(range.end), videosIncluded: pkg.videosIncluded ?? 0, rolledOverIn },
        });
        created++;
      }
    });
  }

  // Close any open period whose end is in the past and that is not the last one... or the last one if the package ended.
  const open = await db.packagePeriod.findMany({ where: { packageId: pkg.id, status: "OPEN", endDate: { lt: dbDate(today) } } });
  for (const p of open) {
    const hasNext = await db.packagePeriod.findFirst({ where: { packageId: pkg.id, startDate: { gt: p.startDate } } });
    if (hasNext || (end && end < today)) {
      await db.packagePeriod.update({ where: { id: p.id }, data: { status: "CLOSED", closedAt: new Date() } });
      closed++;
    }
  }
  return { created, closed };
}

// Contract used by automations: idempotent, safe to call often.
export async function ensurePackagePeriods(today: string = todayMalta()): Promise<{ created: number; closed: number }> {
  const pkgs = await db.servicePackage.findMany({ where: { active: true }, select: { id: true } });
  let created = 0;
  let closed = 0;
  for (const p of pkgs) {
    try {
      const r = await ensurePeriodsForPackage(p.id, today);
      created += r.created;
      closed += r.closed;
    } catch (e) {
      // Unique conflicts from concurrent runs are harmless.
      if (!(e instanceof Error && e.message.includes("Unique constraint"))) throw e;
    }
  }
  return { created, closed };
}

/** The period of a package covering `today` (or the latest one before it). */
export async function currentPeriodFor(packageId: string, today: PlainDate = todayMalta()) {
  const d = dbDate(today);
  return (
    (await db.packagePeriod.findFirst({ where: { packageId, startDate: { lte: d }, endDate: { gte: d } }, orderBy: { startDate: "desc" } })) ??
    (await db.packagePeriod.findFirst({ where: { packageId, startDate: { lte: d } }, orderBy: { startDate: "desc" } }))
  );
}

/** Periods a new video for this client can be assigned to (open and covering today, or open future/ongoing). */
export async function openPeriodsForClient(clientId: string, today: PlainDate = todayMalta()) {
  const d = dbDate(today);
  return db.packagePeriod.findMany({
    where: { status: "OPEN", endDate: { gte: d }, package: { clientId, active: true } },
    include: { package: { select: { id: true, name: true, type: true } } },
    orderBy: [{ startDate: "asc" }],
  });
}

/** Manually close a period and carry rollover into the next one (creating it for recurring packages). */
export async function closePeriodWithRollover(periodId: string) {
  return db.$transaction(async (tx) => {
    const period = await tx.packagePeriod.findUniqueOrThrow({ where: { id: periodId }, include: { package: true } });
    const prog = await periodProgress(period.id, tx);
    const rollover = computeRollover(period.package.rolloverPolicy, period.package.rolloverCap, prog);
    await tx.packagePeriod.update({ where: { id: period.id }, data: { status: "CLOSED", closedAt: new Date() } });
    const next = await tx.packagePeriod.findFirst({ where: { packageId: period.packageId, startDate: { gt: period.startDate } }, orderBy: { startDate: "asc" } });
    if (next) await tx.packagePeriod.update({ where: { id: next.id }, data: { rolledOverIn: rollover } });
    return { rollover, nextId: next?.id ?? null, remaining: prog.remaining };
  });
}
