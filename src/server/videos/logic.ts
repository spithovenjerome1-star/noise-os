import "server-only";
import type { Prisma, StageCategory } from "@prisma/client";
import { db } from "@/lib/db";
import { plainOf, dbDateOrNull, todayMalta, type PlainDate } from "@/lib/dates";
import { nextDeadline, resolveTurnaroundDays } from "@/lib/domain/deadlines";
import { getSettings } from "../settings";

type Tx = Prisma.TransactionClient;

/** Turnaround days for a video: package → client → global default. */
export async function turnaroundFor(tx: Tx | typeof db, clientId: string, packagePeriodId: string | null) {
  const [settings, client, period] = await Promise.all([
    getSettings(),
    tx.client.findUnique({ where: { id: clientId }, select: { turnaroundDays: true } }),
    packagePeriodId ? tx.packagePeriod.findUnique({ where: { id: packagePeriodId }, select: { package: { select: { turnaroundDays: true } } } }) : null,
  ]);
  return resolveTurnaroundDays({ packageDays: period?.package.turnaroundDays, clientDays: client?.turnaroundDays, defaultDays: settings.defaultTurnaroundDays });
}

/**
 * Resolve filmedOn + deadline for a video after an edit or stage change.
 * - Moving out of PLANNED without a filming date stamps today's Malta date as filmed.
 * - Deadline follows filmedOn + turnaround unless manually overridden.
 */
export async function resolveSchedule(
  tx: Tx | typeof db,
  opts: {
    clientId: string;
    packagePeriodId: string | null;
    filmedOn: PlainDate | null;
    manualDeadline: PlainDate | null;
    overridden: boolean;
    fromCategory: StageCategory | null;
    toCategory: StageCategory;
  },
) {
  let filmedOn = opts.filmedOn;
  if (!filmedOn && opts.toCategory !== "PLANNED" && (opts.fromCategory === null || opts.fromCategory === "PLANNED")) filmedOn = todayMalta();
  const days = await turnaroundFor(tx, opts.clientId, opts.packagePeriodId);
  const r = nextDeadline({ filmedOn, manualDeadline: opts.manualDeadline, overridden: opts.overridden, turnaroundDays: days });
  // Without a filming date a manual date is only an override if the user said so,
  // so that the 7-day rule still kicks in once the video is filmed.
  const overridden = filmedOn ? r.overridden : opts.overridden && Boolean(opts.manualDeadline);
  return { filmedOn, deadline: r.deadline, overridden, turnaroundDays: days };
}

/** Timestamps that follow from a stage category change. */
export function stageStamps(from: StageCategory | null, to: StageCategory, current: { approvedAt: Date | null; deliveredAt: Date | null }) {
  const now = new Date();
  const order: StageCategory[] = ["PLANNED", "FILMED", "EDITING", "AWAITING_APPROVAL", "APPROVED", "DELIVERED"];
  const idx = order.indexOf(to);
  return {
    approvedAt: idx >= order.indexOf("APPROVED") ? (current.approvedAt ?? (from !== to ? now : null)) : null,
    deliveredAt: to === "DELIVERED" ? (current.deliveredAt ?? now) : null,
  };
}

/** Keep a SHOOT calendar event in sync with the video's shoot date. */
export async function syncShootEvent(tx: Tx, video: { id: string; title: string; clientId: string; projectId: string | null; shootDate: Date | null }) {
  const existing = await tx.calendarEvent.findFirst({ where: { videoId: video.id, type: "SHOOT" }, orderBy: { createdAt: "asc" } });
  if (!video.shootDate) {
    if (existing) await tx.calendarEvent.deleteMany({ where: { videoId: video.id, type: "SHOOT" } });
    return;
  }
  const duration = existing ? existing.endsAt.getTime() - existing.startsAt.getTime() : 2 * 3600_000;
  const data = {
    title: `Shoot: ${video.title}`,
    startsAt: video.shootDate,
    endsAt: new Date(video.shootDate.getTime() + Math.max(duration, 15 * 60_000)),
    clientId: video.clientId,
    projectId: video.projectId,
  };
  if (existing) await tx.calendarEvent.update({ where: { id: existing.id }, data });
  else await tx.calendarEvent.create({ data: { ...data, type: "SHOOT", videoId: video.id } });
}

export async function nextPositionInStage(tx: Tx | typeof db, stageId: string) {
  const top = await tx.video.aggregate({ where: { stageId }, _max: { position: true } });
  return (top._max.position ?? 0) + 1000;
}

/** Open package periods (current or future) that videos can be assigned to. */
export async function openPeriodOptions(clientId?: string) {
  const today = todayMalta();
  const rows = await db.packagePeriod.findMany({
    where: {
      status: "OPEN",
      endDate: { gte: dbDateOrNull(today)! },
      package: { active: true, ...(clientId ? { clientId } : {}), client: { archivedAt: null } },
    },
    orderBy: { startDate: "asc" },
    select: { id: true, startDate: true, endDate: true, videosIncluded: true, rolledOverIn: true, package: { select: { name: true, clientId: true } } },
  });
  return rows.map((p) => ({
    value: p.id,
    clientId: p.package.clientId,
    label: `${p.package.name} · ${plainOf(p.startDate)} → ${plainOf(p.endDate)}`,
  }));
}
