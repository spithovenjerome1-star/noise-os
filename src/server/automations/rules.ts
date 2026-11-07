import "server-only";
// Automation rule registry.
//
// Every rule is idempotent: it computes the set of conditions that currently hold and
// syncs Notification rows by dedupeKey. Rules NEVER send email/WhatsApp/payment reminders.
//
// Note on package progress: delivered/remaining counts are derived from video stages at read
// time (see src/lib/domain/packages.ts), so "update package progress after delivery" needs no
// stored counters — it is always correct. The package-periods rule only creates new periods.
import { db } from "@/lib/db";
import { addDaysPlain, endOfMonthPlain, maltaDateOf, plainOf, type PlainDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { paymentState, invoiceTotals } from "@/lib/domain/invoices";
import { financeSummary } from "@/lib/domain/finance";
import { classifyDeadlines, dedupeKey, daysWaiting, findDuplicateTasks, previousMonth } from "@/lib/domain/automations";
import { pluralize } from "@/lib/utils";
import { ensurePackagePeriods } from "@/server/packages/periods";
import { generateRecurringExpenses } from "@/server/finance/recurring";
import { syncNotifications, type DesiredNotification } from "./notify";

type Settings = Awaited<ReturnType<typeof db.settings.findFirstOrThrow>>;
export type RuleContext = { today: PlainDate; now: Date; settings: Settings };
export type RuleResult = Record<string, number | string>;

export type Rule = { key: string; title: string; description: string; run: (ctx: RuleContext) => Promise<RuleResult> };

const plain = (d: Date | null) => plainOf(d);

export const RULES: Rule[] = [
  {
    key: "video-deadlines",
    title: "Video deadlines",
    description: "Flags videos due within the warning window and videos past their deadline. Deadlines are set automatically from the filming date (default 7 days).",
    async run({ today, settings }) {
      const videos = await db.video.findMany({
        where: { deadline: { not: null }, stage: { category: { not: "DELIVERED" } } },
        select: { id: true, title: true, deadline: true, clientId: true, client: { select: { name: true } } },
      });
      const { approaching, overdue } = classifyDeadlines(
        videos.map((v) => ({ ...v, deadline: plain(v.deadline), delivered: false })),
        today,
        settings.deadlineWarningDays,
      );
      const soon: DesiredNotification[] = approaching.map((v) => ({
        dedupeKey: dedupeKey("video-due-soon", v.id, v.deadline),
        title: v.daysLeft === 0 ? `Due today: ${v.title}` : `Due in ${pluralize(v.daysLeft, "day")}: ${v.title}`,
        body: v.client.name,
        href: `/videos/${v.id}`,
        severity: "WARNING",
        clientId: v.clientId,
      }));
      const late: DesiredNotification[] = overdue.map((v) => ({
        dedupeKey: dedupeKey("video-overdue", v.id, v.deadline),
        title: `Overdue by ${pluralize(v.daysLate, "day")}: ${v.title}`,
        body: v.client.name,
        href: `/videos/${v.id}`,
        severity: "CRITICAL",
        clientId: v.clientId,
      }));
      const a = await syncNotifications("video-due-soon", soon);
      const b = await syncNotifications("video-overdue", late);
      return { dueSoon: soon.length, overdue: late.length, created: a.created + b.created, resolved: a.resolved + b.resolved };
    },
  },
  {
    key: "unpaid-invoices",
    title: "Unpaid invoices",
    description: "Warns when a client has overdue invoices with an outstanding balance. Status comes from recorded payments only — due dates never mark invoices paid.",
    async run({ today }) {
      const invoices = await db.invoice.findMany({
        where: { status: "SENT" },
        select: { id: true, number: true, totalCents: true, dueDate: true, status: true, clientId: true, client: { select: { name: true } }, payments: { select: { amountCents: true } } },
        orderBy: { dueDate: "asc" },
      });
      const byClient = new Map<string, { name: string; ids: string[]; balance: number; maxDays: number; first: string }>();
      for (const inv of invoices) {
        const st = paymentState({ status: inv.status, totalCents: inv.totalCents, dueDate: plain(inv.dueDate)! }, inv.payments, today);
        if (!st.overdue || st.balanceCents <= 0) continue;
        const g = byClient.get(inv.clientId) ?? { name: inv.client.name, ids: [], balance: 0, maxDays: 0, first: inv.id };
        g.ids.push(inv.number);
        g.balance += st.balanceCents;
        g.maxDays = Math.max(g.maxDays, st.daysOverdue);
        byClient.set(inv.clientId, g);
      }
      const desired: DesiredNotification[] = [...byClient.entries()].map(([clientId, g]) => ({
        dedupeKey: dedupeKey("unpaid-invoices", clientId, g.first),
        title: `${g.name} owes ${formatMoney(g.balance)} overdue`,
        body: `${pluralize(g.ids.length, "invoice")} overdue (${g.ids.join(", ")}), oldest ${pluralize(g.maxDays, "day")} late`,
        href: `/clients/${clientId}?tab=finances`,
        severity: g.maxDays > 30 ? "CRITICAL" : "WARNING",
        clientId,
      }));
      const r = await syncNotifications("unpaid-invoices", desired);
      return { clientsWithOverdue: desired.length, created: r.created, resolved: r.resolved };
    },
  },
  {
    key: "package-periods",
    title: "Recurring package periods",
    description: "Creates the next monthly period for active retainers, closing finished periods and applying the package's rollover rule.",
    async run({ today }) {
      const r = await ensurePackagePeriods(today);
      return { created: r.created, closed: r.closed };
    },
  },
  {
    key: "recurring-expenses",
    title: "Recurring expenses",
    description: "Records expenses from your recurring templates (subscriptions, rent…) when they fall due.",
    async run({ today }) {
      const r = await generateRecurringExpenses(today);
      return { created: r.created };
    },
  },
  {
    key: "inactive-clients",
    title: "Inactive clients & stale projects",
    description: "Flags active clients with no activity, videos or invoices for the configured number of days, and active projects that are past due or untouched.",
    async run({ today, settings }) {
      const cutoff = addDaysPlain(today, -settings.inactiveClientDays);
      const cutoffDate = new Date(`${cutoff}T00:00:00Z`);
      const clients = await db.client.findMany({
        where: { status: "ACTIVE", archivedAt: null },
        select: {
          id: true,
          name: true,
          createdAt: true,
          activity: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
          videos: { select: { updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 1 },
          invoices: { select: { issueDate: true }, orderBy: { issueDate: "desc" }, take: 1 },
        },
      });
      const desired: DesiredNotification[] = [];
      for (const c of clients) {
        const dates = [c.createdAt, c.activity[0]?.createdAt, c.videos[0]?.updatedAt, c.invoices[0]?.issueDate].filter(Boolean) as Date[];
        const last = new Date(Math.max(...dates.map((d) => d.getTime())));
        if (last >= cutoffDate) continue;
        const lastPlain = maltaDateOf(last);
        desired.push({
          dedupeKey: dedupeKey("inactive-client", c.id, lastPlain),
          title: `No activity with ${c.name} for ${pluralize(daysWaiting(lastPlain, today), "day")}`,
          body: "Marked active, but nothing has happened recently. Check in, or update the status.",
          href: `/clients/${c.id}`,
          severity: "INFO",
          clientId: c.id,
        });
      }
      const projects = await db.project.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, name: true, clientId: true, dueDate: true, updatedAt: true, client: { select: { name: true } }, videos: { select: { updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 1 }, tasks: { select: { updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 1 } },
      });
      const stale: DesiredNotification[] = [];
      for (const p of projects) {
        const due = plain(p.dueDate);
        const lastTouch = Math.max(p.updatedAt.getTime(), p.videos[0]?.updatedAt.getTime() ?? 0, p.tasks[0]?.updatedAt.getTime() ?? 0);
        if (due && due < today) {
          stale.push({ dedupeKey: dedupeKey("project-stale", p.id, "due", due), title: `Project past due: ${p.name}`, body: `${p.client.name} · due ${due}`, href: `/clients/${p.clientId}`, severity: "WARNING", clientId: p.clientId });
        } else if (lastTouch < cutoffDate.getTime()) {
          const lp = maltaDateOf(new Date(lastTouch));
          stale.push({ dedupeKey: dedupeKey("project-stale", p.id, "idle", lp), title: `Project idle: ${p.name}`, body: `${p.client.name} · no updates since ${lp}`, href: `/clients/${p.clientId}`, severity: "INFO", clientId: p.clientId });
        }
      }
      const a = await syncNotifications("inactive-client", desired);
      const b = await syncNotifications("project-stale", stale);
      return { inactiveClients: desired.length, staleProjects: stale.length, created: a.created + b.created, resolved: a.resolved + b.resolved };
    },
  },
  {
    key: "monthly-summary",
    title: "Monthly financial summary",
    description: "On the 1st of each month, stores a summary of last month's revenue, expenses, profit and deliveries, and adds it to your inbox.",
    async run({ today, settings }) {
      const month = previousMonth(today);
      // Recomputed on every run so late-recorded invoices/expenses (e.g. imports) are reflected.
      const from = `${month}-01`;
      const to = endOfMonthPlain(from);
      const [invoices, expenses, delivered, openInvoices] = await Promise.all([
        db.invoice.findMany({ select: { status: true, issueDate: true, subtotalCents: true, vatCents: true, totalCents: true, payments: { select: { amountCents: true, paidOn: true } } } }),
        db.expense.findMany({ where: { date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } }, select: { date: true, amountCents: true, vatCents: true, vatReclaimable: true, businessUsePct: true } }),
        db.video.count({ where: { deliveredAt: { gte: new Date(`${from}T00:00:00Z`), lt: new Date(`${addDaysPlain(to, 1)}T00:00:00Z`) } } }),
        db.invoice.findMany({ where: { status: "SENT" }, select: { status: true, totalCents: true, dueDate: true, payments: { select: { amountCents: true } } } }),
      ]);
      const s = financeSummary(
        invoices.map((i) => ({ ...i, issueDate: plain(i.issueDate)!, payments: i.payments.map((p) => ({ amountCents: p.amountCents, paidOn: plain(p.paidOn)! })) })),
        expenses.map((e) => ({ ...e, date: plain(e.date)! })),
        from,
        to,
        settings.estimatedTaxRateBp,
      );
      const outstanding = openInvoices.reduce((sum, i) => sum + paymentState({ status: i.status, totalCents: i.totalCents, dueDate: plain(i.dueDate)! }, i.payments, to).balanceCents, 0);
      const data = { ...s, videosDelivered: delivered, outstandingAtMonthEnd: outstanding, from, to };
      await db.monthlySummary.upsert({ where: { month }, update: { data, generatedAt: new Date() }, create: { month, data } });
      const empty = s.revenueNet === 0 && s.expenseCost === 0 && s.collected === 0 && delivered === 0;
      if (empty) return { month, generated: 1, notified: 0 };
      await syncNotifications(
        "monthly-summary",
        [
          {
            dedupeKey: dedupeKey("monthly-summary", month),
            title: `${month} summary: ${formatMoney(s.revenueNet)} revenue, ${formatMoney(s.operatingProfit)} operating profit`,
            body: `Expenses ${formatMoney(s.expenseCost)} · ${pluralize(delivered, "video")} delivered · ${formatMoney(outstanding)} outstanding. Tax figures are estimates, not accounting advice.`,
            href: `/analytics`,
            severity: "INFO",
          },
        ],
        { keepStale: true },
      );
      return { month, generated: 1, notified: 1 };
    },
  },
  {
    key: "approval-waiting",
    title: "Waiting too long for approval",
    description: "Highlights videos in client review and scripts sent to clients that have waited longer than the configured number of days.",
    async run({ today, settings }) {
      const videos = await db.video.findMany({
        where: { stage: { category: "AWAITING_APPROVAL" } },
        select: { id: true, title: true, clientId: true, stageChangedAt: true, client: { select: { name: true } } },
      });
      const desired: DesiredNotification[] = [];
      for (const v of videos) {
        const since = maltaDateOf(v.stageChangedAt);
        const d = daysWaiting(since, today);
        if (d < settings.approvalStaleDays) continue;
        desired.push({ dedupeKey: dedupeKey("approval-waiting", "video", v.id, since), title: `Waiting ${pluralize(d, "day")} for approval: ${v.title}`, body: v.client.name, href: `/videos/${v.id}`, severity: "WARNING", clientId: v.clientId });
      }
      const scripts = await db.script.findMany({
        where: { status: "SENT" },
        select: { id: true, title: true, clientId: true, updatedAt: true, client: { select: { name: true } }, versions: { where: { sentToClient: true }, orderBy: { version: "desc" }, take: 1, select: { createdAt: true } } },
      });
      for (const s of scripts) {
        const since = maltaDateOf(s.versions[0]?.createdAt ?? s.updatedAt);
        const d = daysWaiting(since, today);
        if (d < settings.approvalStaleDays) continue;
        desired.push({ dedupeKey: dedupeKey("approval-waiting", "script", s.id, since), title: `Script waiting ${pluralize(d, "day")}: ${s.title}`, body: s.client.name, href: `/scripts/${s.id}`, severity: "WARNING", clientId: s.clientId });
      }
      const r = await syncNotifications("approval-waiting", desired);
      return { waiting: desired.length, created: r.created, resolved: r.resolved };
    },
  },
  {
    key: "script-revisions",
    title: "Script revision requests",
    description: "Makes sure every script with requested changes has an open item in your inbox (the client portal also notifies instantly).",
    async run() {
      const scripts = await db.script.findMany({
        where: { status: "CHANGES_REQUESTED" },
        select: { id: true, title: true, clientId: true, revision: true, client: { select: { name: true } } },
      });
      // Avoid doubling up with the notification the portal already created for the same script.
      const openOther = await db.notification.findMany({
        where: { resolvedAt: null, type: { not: "script-revisions" }, href: { in: scripts.map((s) => `/scripts/${s.id}`) } },
        select: { href: true },
      });
      const covered = new Set(openOther.map((n) => n.href));
      const desired: DesiredNotification[] = scripts
        .filter((s) => !covered.has(`/scripts/${s.id}`))
        .map((s) => ({ dedupeKey: dedupeKey("script-revisions", s.id, s.revision), title: `Changes requested: ${s.title}`, body: s.client.name, href: `/scripts/${s.id}`, severity: "WARNING" as const, clientId: s.clientId }));
      const r = await syncNotifications("script-revisions", desired);
      return { changesRequested: scripts.length, created: r.created, resolved: r.resolved };
    },
  },
  {
    key: "data-consistency",
    title: "Duplicate & inconsistent records",
    description: "Detects duplicate open tasks, delivered videos without a delivery link, videos linked to another client's package, invoice totals that don't match their lines, and payments exceeding invoice totals.",
    async run({ today }) {
      const desired: DesiredNotification[] = [];
      const tasks = await db.task.findMany({ where: { status: { not: "DONE" } }, select: { id: true, title: true, clientId: true, dueDate: true } });
      for (const g of findDuplicateTasks(tasks.map((t) => ({ ...t, dueDate: plain(t.dueDate) })))) {
        const ids = g.items.map((t) => t.id).sort();
        desired.push({ dedupeKey: dedupeKey("dup-tasks", ids.join(",")), title: `Possible duplicate tasks: “${g.items[0]!.title}” ×${g.items.length}`, href: `/tasks?task=${ids[0]}`, severity: "INFO", clientId: g.items[0]!.clientId });
      }
      const noLink = await db.video.findMany({ where: { stage: { category: "DELIVERED" }, OR: [{ deliveryUrl: null }, { deliveryUrl: "" }] }, select: { id: true, title: true, clientId: true } });
      for (const v of noLink) desired.push({ dedupeKey: dedupeKey("delivered-no-link", v.id), title: `Delivered without a delivery link: ${v.title}`, href: `/videos/${v.id}`, severity: "INFO", clientId: v.clientId });
      const wrongPeriod = await db.video.findMany({
        where: { packagePeriodId: { not: null } },
        select: { id: true, title: true, clientId: true, packagePeriod: { select: { package: { select: { clientId: true } } } } },
      });
      for (const v of wrongPeriod)
        if (v.packagePeriod && v.packagePeriod.package.clientId !== v.clientId)
          desired.push({ dedupeKey: dedupeKey("video-wrong-package", v.id), title: `Video linked to another client's package: ${v.title}`, href: `/videos/${v.id}`, severity: "WARNING", clientId: v.clientId });
      const invoices = await db.invoice.findMany({
        where: { status: { not: "CANCELLED" } },
        select: { id: true, number: true, clientId: true, subtotalCents: true, vatCents: true, totalCents: true, lines: { select: { qtyHundredths: true, unitCents: true, vatRateBp: true } }, payments: { select: { amountCents: true } } },
      });
      for (const inv of invoices) {
        if (inv.lines.length) {
          const t = invoiceTotals(inv.lines);
          if (t.subtotalCents !== inv.subtotalCents || t.vatCents !== inv.vatCents || t.totalCents !== inv.totalCents)
            desired.push({ dedupeKey: dedupeKey("invoice-total-mismatch", inv.id, inv.totalCents), title: `Invoice ${inv.number}: stored total doesn't match its lines`, body: `Stored ${formatMoney(inv.totalCents)}, lines add up to ${formatMoney(t.totalCents)}`, href: `/invoices/${inv.id}`, severity: "WARNING", clientId: inv.clientId });
        }
        const paid = inv.payments.reduce((s, p) => s + p.amountCents, 0);
        if (paid > inv.totalCents)
          desired.push({ dedupeKey: dedupeKey("invoice-overpaid", inv.id, paid), title: `Invoice ${inv.number}: payments exceed the total`, body: `Paid ${formatMoney(paid)} of ${formatMoney(inv.totalCents)}`, href: `/invoices/${inv.id}`, severity: "WARNING", clientId: inv.clientId });
      }
      void today;
      const r = await syncNotifications("data-consistency", desired);
      return { issues: desired.length, created: r.created, resolved: r.resolved };
    },
  },
];

export async function ruleStates() {
  const rows = await db.automationRule.findMany();
  const map = new Map(rows.map((r) => [r.key, r.enabled]));
  return RULES.map((r) => ({ key: r.key, title: r.title, description: r.description, enabled: map.get(r.key) ?? true }));
}
