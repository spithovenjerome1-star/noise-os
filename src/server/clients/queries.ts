import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { daysBetween, dbDate, maltaDateOf, plainOf, todayMalta, addDaysPlain } from "@/lib/dates";
import { computePeriodProgress, type PeriodProgress } from "@/lib/domain/packages";
import { paymentState } from "@/lib/domain/invoices";
import { clientHealth, type HealthResult } from "@/lib/domain/health";

export const periodVideoSelect = { select: { isExtra: true, stage: { select: { category: true } } } } as const;

export type PeriodWithProgress = {
  id: string;
  packageId: string;
  packageName: string;
  packageType: string;
  startDate: string;
  endDate: string;
  status: string;
  progress: PeriodProgress;
};

/** The "current" period of each active package for the given clients (covering today, else latest started). */
export async function currentPeriodsByClient(clientIds: string[], today = todayMalta()) {
  const t = dbDate(today);
  const pkgs = await db.servicePackage.findMany({
    where: { clientId: { in: clientIds }, active: true },
    include: {
      periods: {
        where: { startDate: { lte: t } },
        orderBy: { startDate: "desc" },
        take: 1,
        include: { videos: periodVideoSelect },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  // Fallback: packages starting in the future → their first period
  const future = pkgs.filter((p) => p.periods.length === 0).map((p) => p.id);
  const futurePeriods = future.length
    ? await db.packagePeriod.findMany({ where: { packageId: { in: future } }, orderBy: { startDate: "asc" }, include: { videos: periodVideoSelect } })
    : [];
  const map = new Map<string, PeriodWithProgress[]>();
  for (const p of pkgs) {
    const period = p.periods[0] ?? futurePeriods.find((fp) => fp.packageId === p.id);
    if (!period) continue;
    const progress = computePeriodProgress(period, period.videos.map((v) => ({ isExtra: v.isExtra, category: v.stage.category })));
    const arr = map.get(p.clientId) ?? [];
    arr.push({
      id: period.id,
      packageId: p.id,
      packageName: p.name,
      packageType: p.type,
      startDate: plainOf(period.startDate)!,
      endDate: plainOf(period.endDate)!,
      status: period.status,
      progress,
    });
    map.set(p.clientId, arr);
  }
  return map;
}

/** Outstanding balance and overdue info per client, derived from payments. */
export async function receivablesByClient(clientIds: string[], today = todayMalta()) {
  const invoices = await db.invoice.findMany({
    where: { clientId: { in: clientIds }, status: "SENT" },
    select: { clientId: true, totalCents: true, dueDate: true, status: true, payments: { select: { amountCents: true, paidOn: true } } },
  });
  const map = new Map<string, { outstanding: number; overdueCount: number; overdueCents: number; lateDays: number[] }>();
  for (const inv of invoices) {
    const s = paymentState({ status: inv.status, totalCents: inv.totalCents, dueDate: plainOf(inv.dueDate)! }, inv.payments, today);
    const r = map.get(inv.clientId) ?? { outstanding: 0, overdueCount: 0, overdueCents: 0, lateDays: [] };
    r.outstanding += s.balanceCents;
    if (s.overdue) {
      r.overdueCount++;
      r.overdueCents += s.balanceCents;
    }
    if (s.status === "PAID" && inv.payments.length) {
      const lastPaid = inv.payments.map((p) => plainOf(p.paidOn)!).sort().at(-1)!;
      r.lateDays.push(Math.max(0, daysBetween(plainOf(inv.dueDate)!, lastPaid)));
    }
    map.set(inv.clientId, r);
  }
  return map;
}

/** Health for a set of clients, computed from real records over the last 90 days. */
export async function healthByClient(
  clients: { id: string; status: Prisma.ClientGetPayload<object>["status"] }[],
  receivables: Awaited<ReturnType<typeof receivablesByClient>>,
  today = todayMalta(),
) {
  const ids = clients.map((c) => c.id);
  const since = dbDate(addDaysPlain(today, -90));
  const [time, revenue, videos, revisionVideos, lastActivity] = await Promise.all([
    db.timeEntry.groupBy({ by: ["clientId"], where: { clientId: { in: ids }, date: { gte: since } }, _sum: { minutes: true } }),
    db.invoice.groupBy({ by: ["clientId"], where: { clientId: { in: ids }, status: "SENT", issueDate: { gte: since } }, _sum: { subtotalCents: true } }),
    db.video.groupBy({ by: ["clientId"], where: { clientId: { in: ids }, createdAt: { gte: since } }, _count: true }),
    // Videos that received revision notes or a "changes requested" decision.
    db.video.groupBy({
      by: ["clientId"],
      where: { clientId: { in: ids }, createdAt: { gte: since }, OR: [{ revisionNotes: { not: null } }, { approvals: { some: { decision: "CHANGES_REQUESTED" } } }] },
      _count: true,
    }),
    db.activityLog.groupBy({ by: ["clientId"], where: { clientId: { in: ids } }, _max: { createdAt: true } }),
  ]);
  const get = <T extends { clientId: string | null }>(arr: T[], id: string) => arr.find((r) => r.clientId === id);
  const out = new Map<string, HealthResult>();
  for (const c of clients) {
    const r = receivables.get(c.id);
    const vids = get(videos, c.id)?._count ?? 0;
    const rev = get(revisionVideos, c.id)?._count ?? 0;
    const last = get(lastActivity, c.id)?._max.createdAt;
    out.set(
      c.id,
      clientHealth({
        status: c.status,
        overdueInvoices: r?.overdueCount ?? 0,
        overdueCents: r?.overdueCents ?? 0,
        avgDaysLate: r?.lateDays.length ? r.lateDays.reduce((a, b) => a + b, 0) / r.lateDays.length : null,
        revisionRatio: vids >= 3 ? rev / vids : null,
        hoursLogged: (get(time, c.id)?._sum.minutes ?? 0) / 60,
        revenueCents: get(revenue, c.id)?._sum.subtotalCents ?? 0,
        daysSinceActivity: last ? daysBetween(maltaDateOf(last), today) : null,
      }),
    );
  }
  return out;
}
