import "server-only";
import { db } from "@/lib/db";
import { addIntervalPlain, daysBetween, dbDate, endOfMonthPlain, maltaDateOf, monthKey, plainOf, startOfMonthPlain, todayMalta, type PlainDate } from "@/lib/dates";
import { expenseCost } from "@/lib/domain/finance";
import { ageBucket } from "@/lib/domain/recurring";
import { loadFinanceSummary, loadInvoiceRows, monthlySeriesRange, outstandingInvoices } from "./queries";

export type AnalyticsRange = { key: "6m" | "12m" | "ytd"; from: PlainDate; to: PlainDate; label: string };

export function resolveRange(key: string | undefined, today = todayMalta()): AnalyticsRange {
  const to = endOfMonthPlain(today);
  if (key === "ytd") return { key: "ytd", from: `${today.slice(0, 4)}-01-01`, to, label: `${today.slice(0, 4)} to date` };
  if (key === "6m") return { key: "6m", from: addIntervalPlain(startOfMonthPlain(today), "MONTHLY", -5), to, label: "Last 6 months" };
  return { key: "12m", from: addIntervalPlain(startOfMonthPlain(today), "MONTHLY", -11), to, label: "Last 12 months" };
}

export type ClientAnalytics = {
  clientId: string;
  name: string;
  revenueCents: number; // actual: net of issued invoices in range
  expenseCents: number; // actual: business cost of expenses linked to the client
  minutes: number; // actual: recorded time
  labourCents: number | null; // estimate: hours × hourly cost (null if no rate given)
  profitCents: number; // revenue − expenses − labour estimate (if any)
  effectiveHourlyCents: number | null; // estimate: (revenue − expenses) / hours
  videosDelivered: number;
  highWorkload: boolean;
};

export async function loadAnalytics(range: AnalyticsRange, hourlyCostCents: number | null) {
  const today = todayMalta();
  const { from, to } = range;
  const [series, summary, invoices, expenses, timeEntries, delivered, outstanding, retainers] = await Promise.all([
    monthlySeriesRange(from, to),
    loadFinanceSummary(from, to),
    loadInvoiceRows({ status: "SENT", issueDate: { gte: dbDate(from), lte: dbDate(to) } }, today),
    db.expense.findMany({
      where: { date: { gte: dbDate(from), lte: dbDate(to) }, clientId: { not: null } },
      select: { clientId: true, amountCents: true, vatCents: true, vatReclaimable: true, businessUsePct: true, date: true },
    }),
    db.timeEntry.findMany({ where: { date: { gte: dbDate(from), lte: dbDate(to) } }, select: { clientId: true, minutes: true } }),
    db.video.findMany({
      // Generous moment window; exact Malta-day filtering below.
      where: { deliveredAt: { gte: new Date(dbDate(from).getTime() - 86400_000), lt: new Date(dbDate(to).getTime() + 2 * 86400_000) } },
      select: { clientId: true, deliveredAt: true, filmedOn: true, deadline: true },
    }),
    outstandingInvoices(today),
    db.servicePackage.findMany({
      where: { active: true, type: "MONTHLY_RETAINER", client: { archivedAt: null }, OR: [{ endDate: null }, { endDate: { gte: dbDate(today) } }] },
      select: { id: true, name: true, priceCents: true, endDate: true, client: { select: { id: true, name: true } } },
    }),
  ]);

  // ── Videos & turnaround (actual)
  const deliveredInRange = delivered
    .map((v) => ({ ...v, day: maltaDateOf(v.deliveredAt!) }))
    .filter((v) => v.day >= from && v.day <= to);
  const videosByMonth = new Map<string, number>();
  for (const s of series) videosByMonth.set(s.month, 0);
  for (const v of deliveredInRange) videosByMonth.set(monthKey(v.day), (videosByMonth.get(monthKey(v.day)) ?? 0) + 1);
  const turnarounds = deliveredInRange.filter((v) => v.filmedOn).map((v) => daysBetween(plainOf(v.filmedOn)!, v.day));
  const withDeadline = deliveredInRange.filter((v) => v.deadline);
  const onTime = withDeadline.filter((v) => v.day <= plainOf(v.deadline)!).length;

  // ── Per client
  const map = new Map<string, ClientAnalytics>();
  const ensure = (id: string, name = "") => {
    let c = map.get(id);
    if (!c) {
      c = { clientId: id, name, revenueCents: 0, expenseCents: 0, minutes: 0, labourCents: null, profitCents: 0, effectiveHourlyCents: null, videosDelivered: 0, highWorkload: false };
      map.set(id, c);
    }
    if (name && !c.name) c.name = name;
    return c;
  };
  for (const i of invoices) ensure(i.clientId, i.clientName).revenueCents += i.subtotalCents;
  for (const e of expenses) ensure(e.clientId!).expenseCents += expenseCost({ ...e, date: plainOf(e.date)! });
  for (const t of timeEntries) ensure(t.clientId).minutes += t.minutes;
  for (const v of deliveredInRange) ensure(v.clientId).videosDelivered++;
  const missingNames = [...map.values()].filter((c) => !c.name).map((c) => c.clientId);
  if (missingNames.length) {
    const rows = await db.client.findMany({ where: { id: { in: missingNames } }, select: { id: true, name: true } });
    for (const r of rows) map.get(r.id)!.name = r.name;
  }
  const clients = [...map.values()];
  for (const c of clients) {
    const hours = c.minutes / 60;
    c.labourCents = hourlyCostCents !== null && c.minutes > 0 ? Math.round(hours * hourlyCostCents) : null;
    c.profitCents = c.revenueCents - c.expenseCents - (c.labourCents ?? 0);
    c.effectiveHourlyCents = c.minutes > 0 ? Math.round((c.revenueCents - c.expenseCents) / hours) : null;
  }
  // High workload vs revenue: ≥5h logged and effective rate under half the median effective rate.
  const rates = clients.filter((c) => c.effectiveHourlyCents !== null && c.minutes >= 300).map((c) => c.effectiveHourlyCents!).sort((a, b) => a - b);
  const median = rates.length ? rates[Math.floor(rates.length / 2)]! : null;
  if (median !== null && rates.length >= 2)
    for (const c of clients) if (c.minutes >= 300 && c.effectiveHourlyCents !== null && c.effectiveHourlyCents < median / 2) c.highWorkload = true;
  clients.sort((a, b) => b.revenueCents - a.revenueCents);

  // ── Recurring vs one-off (actual)
  const recurringCents = invoices.filter((i) => i.isRecurring).reduce((s, i) => s + i.subtotalCents, 0);
  const oneOffCents = invoices.filter((i) => !i.isRecurring).reduce((s, i) => s + i.subtotalCents, 0);

  // ── Ageing (actual balances, by days past due)
  const ageing = { current: 0, d1_30: 0, d31_60: 0, d60p: 0 };
  for (const r of outstanding.rows) ageing[ageBucket(r.state.daysOverdue)] += r.state.balanceCents;

  // ── Contracted upcoming revenue (estimate): next 12 months max, open-ended = 3 months
  const nextMonth = addIntervalPlain(startOfMonthPlain(today), "MONTHLY", 1);
  const contracted = retainers.map((p) => {
    let months = 3;
    if (p.endDate) {
      const end = plainOf(p.endDate)!;
      months = 0;
      for (let m = nextMonth; m <= end && months < 12; m = addIntervalPlain(m, "MONTHLY", 1)) months++;
    }
    return { packageId: p.id, name: p.name, clientId: p.client.id, clientName: p.client.name, monthlyCents: p.priceCents, months, openEnded: !p.endDate, totalCents: p.priceCents * months };
  });

  const totalDelivered = deliveredInRange.length;
  return {
    range,
    series: series.map((s) => ({ ...s, videos: videosByMonth.get(s.month) ?? 0 })),
    summary,
    clients,
    medianHourlyCents: median,
    videos: {
      delivered: totalDelivered,
      avgTurnaroundDays: turnarounds.length ? turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length : null,
      turnaroundSample: turnarounds.length,
      onTimePct: withDeadline.length ? Math.round((onTime / withDeadline.length) * 100) : null,
      withDeadline: withDeadline.length,
      avgRevenuePerVideoCents: totalDelivered ? Math.round(summary.revenueNet / totalDelivered) : null,
    },
    revenueMix: { recurringCents, oneOffCents },
    ageing,
    outstanding: { totalCents: outstanding.totalCents, count: outstanding.count },
    contracted: { items: contracted, totalCents: contracted.reduce((s, c) => s + c.totalCents, 0) },
    hasTime: timeEntries.length > 0,
  };
}

export type Analytics = Awaited<ReturnType<typeof loadAnalytics>>;
