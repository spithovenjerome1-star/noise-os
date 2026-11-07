import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clapperboard, Clock, Users } from "lucide-react";
import { requireUser } from "@/server/auth";
import { can } from "@/lib/permissions";
import { loadDashboard } from "@/server/dashboard";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { formatMoney } from "@/lib/money";
import { addDaysPlain, fmtDate, fmtMoment, maltaDateOf, relativeDays, timeAgo } from "@/lib/dates";
import { DEADLINE_STATE, EVENT_TYPE, PRIORITY } from "@/lib/labels";
import { cn, pluralize } from "@/lib/utils";

export const dynamic = "force-dynamic";

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Malta", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function Dashboard() {
  const user = await requireUser();
  const finance = can(user.role, "finance:view");
  const d = await loadDashboard({ finance });
  const f = d.finance;

  const attention = [
    ...d.overdueVideos.map((v) => ({ key: "v" + v.id, href: `/videos/${v.id}`, title: v.title, meta: `${v.client} · due ${relativeDays(v.deadline, d.today).toLowerCase()}`, tone: "danger" as const, label: "Overdue" })),
    ...(f?.overdueInvoices ?? []).map((i) => ({ key: "i" + i.id, href: `/invoices/${i.id}`, title: `${i.number} · ${formatMoney(i.balanceCents)}`, meta: `${i.client} · ${pluralize(i.daysOverdue, "day")} overdue`, tone: "danger" as const, label: "Unpaid" })),
    ...d.staleApprovals.map((v) => ({ key: "a" + v.id, href: `/videos/${v.id}`, title: v.title, meta: `${v.client.name} · waiting for approval ${timeAgo(v.stageChangedAt)}`, tone: "warning" as const, label: "Approval" })),
    ...d.notifications
      .filter((n) => !n.type.startsWith("video-overdue") && !n.type.startsWith("unpaid"))
      .map((n) => ({ key: "n" + n.id, href: n.href ?? "/notifications", title: n.title, meta: n.body ?? "", tone: n.severity === "CRITICAL" ? ("danger" as const) : ("warning" as const), label: "Alert" })),
  ].slice(0, 8);

  // Week schedule: events + deadlines grouped per Malta day
  const days = Array.from({ length: 7 }, (_, i) => addDaysPlain(d.today, i));
  const schedule = days.map((day) => ({
    day,
    events: d.events.filter((e) => maltaDateOf(e.startsAt) === day),
    deadlines: d.deadlines.filter((v) => v.deadline === day),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs text-subtle">{fmtDate(d.today, "EEEE d MMMM")}</p>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight">{greeting()}, {user.name.split(" ")[0]}</h1>
      </div>

      {/* Summary cards */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Summary">
        {f && (
          <>
            <Metric href="/invoices" label="Revenue this month" value={formatMoney(f.month.revenueNet)} sub={`Net invoiced · ${formatMoney(f.month.collected)} collected`} />
            <Metric href="/expenses" label="Operating expenses" value={formatMoney(f.month.expenseCost)} sub="This month, net of reclaimable VAT" />
            <Metric href="/analytics" label="Net operating profit" value={formatMoney(f.month.operatingProfit)} sub="Revenue − operating expenses" tone={f.month.operatingProfit < 0 ? "danger" : undefined} />
            <Metric href="/invoices?status=OUTSTANDING" label="Outstanding" value={formatMoney(f.outstandingCents)} sub={f.overdueCents > 0 ? `${formatMoney(f.overdueCents)} overdue` : "Nothing overdue"} tone={f.overdueCents > 0 ? "danger" : undefined} />
          </>
        )}
        <Metric href="/clients?status=ACTIVE" label="Active clients" value={String(d.activeClients)} icon={Users} />
        <Metric href="/packages" label="Videos remaining" value={String(d.videosRemaining)} sub={`Across ${pluralize(d.packages.length, "current package")}`} icon={Clapperboard} />
        <Metric href="/videos?view=list&deadline=soon" label="Deadlines next 7 days" value={String(d.upcomingDeadlines7)} sub={d.overdueVideos.length ? `${d.overdueVideos.length} overdue` : undefined} tone={d.overdueVideos.length ? "danger" : undefined} icon={Clock} />
        <Metric href="/tasks?view=overdue" label="Overdue tasks" value={String(d.overdueTasks)} tone={d.overdueTasks ? "danger" : undefined} icon={CheckCircle2} />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Needs attention */}
        <Card className="xl:col-span-2">
          <CardHeader title="Needs attention" description="Overdue work, unpaid invoices and stale approvals" action={<Button variant="ghost" size="sm" asChild><Link href="/notifications">Inbox <ArrowUpRight /></Link></Button>} />
          <CardBody className="pb-2">
            {attention.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg bg-success-bg px-3 py-3 text-[13px] text-success"><CheckCircle2 className="size-4" /> All clear — nothing needs your attention.</div>
            ) : (
              <ul className="-mx-2 divide-y divide-border">
                {attention.map((a) => (
                  <li key={a.key}>
                    <Link href={a.href} className="flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-surface-2">
                      <AlertTriangle className={cn("size-4 shrink-0", a.tone === "danger" ? "text-danger" : "text-warning")} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium">{a.title}</div>
                        <div className="truncate text-xs text-muted">{a.meta}</div>
                      </div>
                      <Badge tone={a.tone}>{a.label}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* Today */}
        <Card>
          <CardHeader title="Today's tasks" action={<Button variant="ghost" size="sm" asChild><Link href="/tasks?view=today">All <ArrowUpRight /></Link></Button>} />
          <CardBody className="pb-2">
            {d.todayTasks.length === 0 ? (
              <p className="py-4 text-[13px] text-muted">No tasks due today.</p>
            ) : (
              <ul className="-mx-2">
                {d.todayTasks.map((t) => (
                  <li key={t.id}>
                    <Link href={`/tasks?task=${t.id}`} className="flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-surface-2">
                      <span className={cn("size-1.5 shrink-0 rounded-full", t.priority === "URGENT" ? "bg-danger" : t.priority === "HIGH" ? "bg-warning" : "bg-border-strong")} />
                      <span className="min-w-0 flex-1 truncate text-[13px]">{t.title}</span>
                      {t.dueDate && t.dueDate < d.today ? <span className="text-xs text-danger">{relativeDays(t.dueDate, d.today)}</span> : t.client && <span className="truncate text-xs text-subtle">{t.client.name}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Week */}
        <Card className="xl:col-span-2">
          <CardHeader title="This week" description="Shoots, meetings and editing deadlines" action={<Button variant="ghost" size="sm" asChild><Link href="/calendar?view=week">Calendar <ArrowUpRight /></Link></Button>} />
          <CardBody>
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-7">
              {schedule.map((s) => (
                <div key={s.day} className={cn("min-h-24 bg-surface p-2", s.day === d.today && "bg-surface-2/60")}>
                  <div className="mb-1.5 flex items-baseline gap-1 sm:flex-col sm:gap-0">
                    <span className="text-[11px] text-subtle">{fmtDate(s.day, "EEE")}</span>
                    <span className={cn("tabular text-[13px] font-medium", s.day === d.today && "text-accent")}>{fmtDate(s.day, "d")}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {s.events.map((e) => (
                      <Link key={e.id} href={`/calendar?view=day&date=${s.day}`} className={cn("truncate rounded px-1.5 py-0.5 text-[11px]", EVENT_TYPE[e.type].chip)} title={`${e.title}${e.client ? ` · ${e.client.name}` : ""}`}>
                        {!e.allDay && <span className="tabular opacity-70">{fmtMoment(e.startsAt, "HH:mm")} </span>}
                        {e.title}
                      </Link>
                    ))}
                    {s.deadlines.map((v) => (
                      <Link key={v.id} href={`/videos/${v.id}`} className={cn("truncate rounded px-1.5 py-0.5 text-[11px]", EVENT_TYPE.EDIT_DEADLINE.chip)} title={`Deadline: ${v.title}`}>
                        ⏱ {v.title}
                      </Link>
                    ))}
                    {!s.events.length && !s.deadlines.length && <span className="hidden text-[11px] text-subtle sm:block">—</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Deadlines */}
        <Card>
          <CardHeader title="Upcoming deadlines" action={<Button variant="ghost" size="sm" asChild><Link href="/videos?view=list">Pipeline <ArrowUpRight /></Link></Button>} />
          <CardBody className="pb-2">
            {d.deadlines.length === 0 ? (
              <p className="py-4 text-[13px] text-muted">No video deadlines in the next two weeks.</p>
            ) : (
              <ul className="-mx-2">
                {d.deadlines.map((v) => (
                  <li key={v.id}>
                    <Link href={`/videos/${v.id}`} className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-surface-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px]">{v.title}</div>
                        <div className="truncate text-xs text-subtle">{v.client} · {v.stage}</div>
                      </div>
                      <Badge tone={DEADLINE_STATE[v.state].tone}>{relativeDays(v.deadline, d.today)}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Packages */}
        <Card className={f ? "xl:col-span-1" : "xl:col-span-3"}>
          <CardHeader title="Package progress" description="Current period, delivered vs included" action={<Button variant="ghost" size="sm" asChild><Link href="/packages">All <ArrowUpRight /></Link></Button>} />
          <CardBody>
            {d.packages.length === 0 ? (
              <EmptyState icon={Clapperboard} title="No active packages" description="Create a package for a client to track the videos you owe." className="py-8" action={<Button size="sm" asChild><Link href="/packages?new=1">New package</Link></Button>} />
            ) : (
              <ul className="flex flex-col gap-4">
                {d.packages.slice(0, 6).map((p) => (
                  <li key={p.periodId}>
                    <Link href={`/packages/${p.packageId}`} className="group block">
                      <div className="mb-1.5 flex items-baseline justify-between gap-2">
                        <span className="truncate text-[13px] font-medium group-hover:underline">{p.client.name}</span>
                        <span className="tabular shrink-0 text-xs text-muted">
                          {p.progress.delivered}/{p.progress.included} delivered · <span className="text-fg">{p.progress.remaining} left</span>
                        </span>
                      </div>
                      <Progress
                        value={p.progress.pctDelivered}
                        segments={[
                          { value: p.progress.pctDelivered, className: "bg-success" },
                          { value: p.progress.included ? (p.progress.approvedNotDelivered / p.progress.included) * 100 : 0, className: "bg-success/40" },
                        ]}
                      />
                      <div className="mt-1 text-[11px] text-subtle">{p.packageName} · ends {fmtDate(p.endDate, "d MMM")}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {f && (
          <Card className="xl:col-span-2">
            <CardHeader title="Revenue & expenses" description="Last 6 months · revenue = issued invoices excl. VAT" action={<Button variant="ghost" size="sm" asChild><Link href="/analytics">Analytics <ArrowUpRight /></Link></Button>} />
            <CardBody>
              <TrendChart data={f.trend} />
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, sub, href, tone, icon: Icon }: { label: string; value: string; sub?: string; href: string; tone?: "danger"; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <Link href={href} className="group rounded-xl border border-border bg-surface p-4 shadow-card transition-colors hover:border-border-strong">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        {Icon ? <Icon className="size-3.5 text-subtle" /> : <ArrowUpRight className="size-3.5 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />}
      </div>
      <div className={cn("tabular mt-2 text-xl font-semibold tracking-tight sm:text-2xl", tone === "danger" && value !== "0" && value !== formatMoney(0) && "text-danger")}>{value}</div>
      {sub && <div className="mt-1 truncate text-xs text-subtle">{sub}</div>}
    </Link>
  );
}
