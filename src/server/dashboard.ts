import "server-only";
import { db } from "@/lib/db";
import { addDaysPlain, dbDate, endOfMonthPlain, maltaDayRange, plainOf, startOfMonthPlain, todayMalta, addIntervalPlain, type PlainDate } from "@/lib/dates";
import { financeSummary, type FinExpense, type FinInvoice } from "@/lib/domain/finance";
import { paymentState } from "@/lib/domain/invoices";
import { computePeriodProgress } from "@/lib/domain/packages";
import { deadlineState } from "@/lib/domain/deadlines";
import { getSettings } from "./settings";

/** Every dashboard figure is computed from database records here. */
export async function loadDashboard(opts: { finance: boolean }) {
  const today = todayMalta();
  const settings = await getSettings();
  const monthStart = startOfMonthPlain(today);
  const monthEnd = endOfMonthPlain(today);
  const sixMonthsStart = addIntervalPlain(monthStart, "MONTHLY", -5);
  const weekEnd = addDaysPlain(today, 6);

  const [activeClients, openPeriods, upcomingVideos, overdueTasks, todayTasks, events, awaitingApproval, notifications] = await Promise.all([
    db.client.count({ where: { status: "ACTIVE", archivedAt: null } }),
    db.packagePeriod.findMany({
      where: { status: "OPEN", startDate: { lte: dbDate(today) }, endDate: { gte: dbDate(today) }, package: { active: true, client: { archivedAt: null } } },
      include: {
        package: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
        videos: { select: { isExtra: true, stage: { select: { category: true } } } },
      },
    }),
    db.video.findMany({
      where: { deadline: { not: null, lte: dbDate(addDaysPlain(today, 14)) }, stage: { category: { not: "DELIVERED" } } },
      orderBy: { deadline: "asc" },
      take: 50,
      select: { id: true, title: true, deadline: true, priority: true, client: { select: { name: true } }, stage: { select: { name: true, category: true } } },
    }),
    db.task.count({ where: { status: { not: "DONE" }, dueDate: { lt: dbDate(today) } } }),
    db.task.findMany({
      where: { status: { not: "DONE" }, dueDate: { lte: dbDate(today) } },
      orderBy: [{ dueDate: "asc" }, { priority: "asc" }],
      take: 8,
      select: { id: true, title: true, dueDate: true, priority: true, client: { select: { name: true } } },
    }),
    db.calendarEvent.findMany({
      where: { startsAt: { gte: maltaDayRange(today).start, lt: maltaDayRange(addDaysPlain(weekEnd, 1)).start } },
      orderBy: { startsAt: "asc" },
      select: { id: true, title: true, type: true, startsAt: true, endsAt: true, allDay: true, location: true, client: { select: { name: true } } },
    }),
    db.video.findMany({
      where: { stage: { category: "AWAITING_APPROVAL" } },
      orderBy: { stageChangedAt: "asc" },
      take: 10,
      select: { id: true, title: true, stageChangedAt: true, client: { select: { name: true } } },
    }),
    db.notification.findMany({ where: { resolvedAt: null, severity: { in: ["CRITICAL", "WARNING"] } }, orderBy: { createdAt: "desc" }, take: 6 }),
  ]);

  const packages = openPeriods
    .map((p) => ({
      periodId: p.id,
      packageId: p.package.id,
      packageName: p.package.name,
      client: p.package.client,
      endDate: plainOf(p.endDate)!,
      progress: computePeriodProgress(p, p.videos.map((v) => ({ isExtra: v.isExtra, category: v.stage.category }))),
    }))
    .sort((a, b) => b.progress.remaining - a.progress.remaining);
  const videosRemaining = packages.reduce((s, p) => s + p.progress.remaining, 0);

  const deadlines = upcomingVideos.map((v) => ({
    id: v.id,
    title: v.title,
    client: v.client.name,
    stage: v.stage.name,
    deadline: plainOf(v.deadline)!,
    priority: v.priority,
    state: deadlineState(plainOf(v.deadline), v.stage.category, today, settings.deadlineWarningDays),
  }));
  const upcomingDeadlines7 = deadlines.filter((d) => d.deadline >= today && d.deadline <= weekEnd).length;
  const overdueVideos = deadlines.filter((d) => d.state === "overdue");

  let finance: null | {
    month: ReturnType<typeof financeSummary>;
    outstandingCents: number;
    overdueCents: number;
    overdueInvoices: { id: string; number: string; client: string; balanceCents: number; daysOverdue: number }[];
    trend: { month: string; revenue: number; expenses: number; profit: number }[];
  } = null;

  if (opts.finance) {
    const [invoices, expenses] = await Promise.all([
      db.invoice.findMany({
        where: { status: { not: "DRAFT" } },
        select: { id: true, number: true, status: true, issueDate: true, dueDate: true, subtotalCents: true, vatCents: true, totalCents: true, client: { select: { name: true } }, payments: { select: { amountCents: true, paidOn: true } } },
      }),
      db.expense.findMany({ where: { date: { gte: dbDate(sixMonthsStart) } }, select: { date: true, amountCents: true, vatCents: true, vatReclaimable: true, businessUsePct: true } }),
    ]);
    const finInv: FinInvoice[] = invoices.map((i) => ({
      status: i.status,
      issueDate: plainOf(i.issueDate)!,
      subtotalCents: i.subtotalCents,
      vatCents: i.vatCents,
      totalCents: i.totalCents,
      payments: i.payments.map((p) => ({ amountCents: p.amountCents, paidOn: plainOf(p.paidOn)! })),
    }));
    const finExp: FinExpense[] = expenses.map((e) => ({ ...e, date: plainOf(e.date)! }));
    let outstanding = 0;
    let overdue = 0;
    const overdueInvoices: { id: string; number: string; client: string; balanceCents: number; daysOverdue: number }[] = [];
    for (const i of invoices) {
      const st = paymentState({ status: i.status, totalCents: i.totalCents, dueDate: plainOf(i.dueDate)! }, i.payments, today);
      if (i.status === "SENT") outstanding += st.balanceCents;
      if (st.overdue) {
        overdue += st.balanceCents;
        overdueInvoices.push({ id: i.id, number: i.number, client: i.client.name, balanceCents: st.balanceCents, daysOverdue: st.daysOverdue });
      }
    }
    const trend: { month: string; revenue: number; expenses: number; profit: number }[] = [];
    for (let m = 0; m < 6; m++) {
      const from: PlainDate = addIntervalPlain(sixMonthsStart, "MONTHLY", m);
      const s = financeSummary(finInv, finExp, from, endOfMonthPlain(from), settings.estimatedTaxRateBp);
      trend.push({ month: from, revenue: s.revenueNet, expenses: s.expenseCost, profit: s.operatingProfit });
    }
    finance = {
      month: financeSummary(finInv, finExp, monthStart, monthEnd, settings.estimatedTaxRateBp),
      outstandingCents: outstanding,
      overdueCents: overdue,
      overdueInvoices: overdueInvoices.sort((a, b) => b.daysOverdue - a.daysOverdue).slice(0, 6),
      trend,
    };
  }

  const staleApprovals = awaitingApproval.filter((v) => (Date.now() - v.stageChangedAt.getTime()) / 86400_000 >= settings.approvalStaleDays);

  return {
    today,
    activeClients,
    videosRemaining,
    packages,
    deadlines: deadlines.filter((d) => d.state !== "done").slice(0, 8),
    upcomingDeadlines7,
    overdueVideos,
    overdueTasks,
    todayTasks: todayTasks.map((t) => ({ ...t, dueDate: plainOf(t.dueDate) })),
    events,
    awaitingApproval,
    staleApprovals,
    notifications,
    finance,
  };
}
