import Link from "next/link";
import { AlertTriangle, BarChart3 } from "lucide-react";
import { requireUser } from "@/server/auth";
import { loadAnalytics, resolveRange } from "@/server/finance/analytics";
import { getSettings } from "@/server/settings";
import { formatMoney, formatRateBp, parseMoney, centsToInput } from "@/lib/money";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Segmented } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { MoneyTrendChart, VideosChart } from "@/components/finance/charts";
import { cn } from "@/lib/utils";

export const metadata = { title: "Analytics" };

function Est({ children = "Estimate" }: { children?: React.ReactNode }) {
  return <span className="ml-1.5 inline-flex h-4 items-center rounded border border-dashed border-border-strong px-1 align-middle text-[10px] font-medium uppercase tracking-wide text-subtle">{children}</span>;
}

function hours(min: number) {
  const h = min / 60;
  return h >= 10 ? `${Math.round(h)}h` : `${h.toFixed(1)}h`;
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string; rate?: string }> }) {
  await requireUser("analytics:view");
  const sp = await searchParams;
  const range = resolveRange(sp.range);
  const rateCents = sp.rate ? parseMoney(sp.rate) : null;
  const [a, settings] = await Promise.all([loadAnalytics(range, rateCents !== null && rateCents > 0 ? rateCents : null), getSettings()]);
  const s = a.summary;
  const q = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { range: range.key, rate: sp.rate, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/analytics?${p}`;
  };
  const hasAny = a.series.some((m) => m.revenueNet || m.expenseCost || m.videos) || a.outstanding.count > 0 || a.contracted.items.length > 0;
  const mixTotal = a.revenueMix.recurringCents + a.revenueMix.oneOffCents;
  const ageTotal = a.ageing.current + a.ageing.d1_30 + a.ageing.d31_60 + a.ageing.d60p;
  const maxClientRev = Math.max(1, ...a.clients.map((c) => c.revenueCents));

  return (
    <>
      <PageHeader
        title="Analytics"
        description={
          <>
            Actual figures come from your invoices, payments, expenses, videos and time logs. Anything marked <Est /> is a projection or a derived estimate.
          </>
        }
        actions={
          <Segmented
            active={range.key}
            items={[
              { key: "6m", label: "6 months", href: q({ range: "6m" }) },
              { key: "12m", label: "12 months", href: q({ range: "12m" }) },
              { key: "ytd", label: "This year", href: q({ range: "ytd" }) },
            ]}
          />
        }
      />

      {!hasAny ? (
        <EmptyState icon={BarChart3} title="Nothing to analyse yet" description="Analytics fill in as you record invoices, expenses, deliveries and time." />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-5">
            <Kpi label="Revenue" value={formatMoney(s.revenueNet)} sub="Issued invoices, ex VAT" />
            <Kpi label="Expenses" value={formatMoney(s.expenseCost)} sub="Business cost" />
            <Kpi label="Operating profit" value={formatMoney(s.operatingProfit)} sub={s.revenueNet ? `${Math.round((s.operatingProfit / s.revenueNet) * 100)}% margin` : undefined} tone={s.operatingProfit < 0 ? "danger" : undefined} />
            <Kpi label="Cash collected" value={formatMoney(s.collected)} sub={`Net cash flow ${formatMoney(s.cashFlow)}`} />
            <Kpi label="Outstanding now" value={formatMoney(a.outstanding.totalCents)} sub={`${a.outstanding.count} unpaid`} href="/invoices?status=UNPAID" />
          </div>

          <Card>
            <CardHeader title="Revenue, expenses & operating profit" description={`${range.label} · by month (accrual: invoices count on their issue date)`} />
            <CardBody>
              <MoneyTrendChart data={a.series} />
            </CardBody>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Videos delivered" description={`${a.videos.delivered} in ${range.label.toLowerCase()}`} />
              <CardBody>
                <VideosChart data={a.series} />
                <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4">
                  <Mini
                    label="Avg turnaround"
                    value={a.videos.avgTurnaroundDays === null ? "—" : `${a.videos.avgTurnaroundDays.toFixed(1)} days`}
                    sub={a.videos.turnaroundSample ? `filming → delivery, ${a.videos.turnaroundSample} videos` : "needs filming dates"}
                  />
                  <Mini label="Delivered on time" value={a.videos.onTimePct === null ? "—" : `${a.videos.onTimePct}%`} sub={a.videos.withDeadline ? `of ${a.videos.withDeadline} with a deadline` : "no deadlines yet"} />
                  <Mini label={<>Revenue / video<Est /></>} value={a.videos.avgRevenuePerVideoCents === null ? "—" : formatMoney(a.videos.avgRevenuePerVideoCents)} sub="revenue ÷ delivered" />
                </div>
              </CardBody>
            </Card>

            <div className="flex flex-col gap-5">
              <Card>
                <CardHeader title="Recurring vs one-off revenue" description="Recurring = invoices linked to a monthly retainer period" />
                <CardBody>
                  {mixTotal === 0 ? (
                    <p className="text-[13px] text-muted">No issued invoices in this period.</p>
                  ) : (
                    <>
                      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
                        <div className="h-full rounded-l-full bg-fg" style={{ width: `${(a.revenueMix.recurringCents / mixTotal) * 100}%` }} />
                        <div className="h-full flex-1 rounded-r-full bg-surface-3" />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <Mini label={<span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-fg" />Recurring</span>} value={formatMoney(a.revenueMix.recurringCents)} sub={`${Math.round((a.revenueMix.recurringCents / mixTotal) * 100)}%`} />
                        <Mini label={<span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-surface-3 ring-1 ring-border-strong" />One-off</span>} value={formatMoney(a.revenueMix.oneOffCents)} sub={`${Math.round((a.revenueMix.oneOffCents / mixTotal) * 100)}%`} />
                      </div>
                    </>
                  )}
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Outstanding by age" description="Unpaid balances by days past due" action={<Link href="/invoices?status=UNPAID" className="text-xs text-muted hover:text-fg">View</Link>} />
                <CardBody>
                  {ageTotal === 0 ? (
                    <p className="text-[13px] text-muted">Nothing outstanding.</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {([
                        ["Not yet due", a.ageing.current, false],
                        ["1–30 days", a.ageing.d1_30, true],
                        ["31–60 days", a.ageing.d31_60, true],
                        ["60+ days", a.ageing.d60p, true],
                      ] as const).map(([label, v, late]) => (
                        <div key={label} className="rounded-lg border border-border p-2.5">
                          <div className="text-[11px] text-muted">{label}</div>
                          <div className={cn("tabular mt-1 text-[13px] font-semibold", late && v > 0 && "text-danger")}>{formatMoney(v)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>
          </div>

          <Card className="overflow-hidden">
            <CardHeader
              title="Clients: revenue & profitability"
              description="Revenue and linked expenses are actual. Labour cost and effective hourly rate are estimates from logged time."
              action={
                <form action="/analytics" className="flex items-center gap-2">
                  <input type="hidden" name="range" value={range.key} />
                  <label htmlFor="rate" className="hidden text-xs text-muted sm:block">
                    Labour cost / hour
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-subtle">€</span>
                    <Input id="rate" name="rate" inputMode="decimal" placeholder="e.g. 25" defaultValue={rateCents ? centsToInput(rateCents) : ""} className="tabular h-7 w-24 pl-5 text-xs" />
                  </div>
                  <Button size="sm" type="submit">
                    Apply
                  </Button>
                </form>
              }
            />
            {a.clients.length === 0 ? (
              <CardBody>
                <p className="text-[13px] text-muted">No client revenue, expenses or time in this period.</p>
              </CardBody>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Client</TH>
                    <TH className="text-right">Revenue</TH>
                    <TH className="hidden text-right md:table-cell">Linked expenses</TH>
                    <TH className="hidden text-right sm:table-cell">Time</TH>
                    {rateCents ? <TH className="hidden text-right lg:table-cell">Labour <Est /></TH> : null}
                    <TH className="text-right">Profit{rateCents ? <Est /> : null}</TH>
                    <TH className="text-right">€ / hour <Est /></TH>
                    <TH className="hidden text-right md:table-cell">Videos</TH>
                  </TR>
                </THead>
                <TBody>
                  {a.clients.map((c) => (
                    <TR key={c.clientId}>
                      <TD className="min-w-40">
                        <div className="flex items-center gap-2">
                          <Link href={`/clients/${c.clientId}?tab=finances`} className="font-medium hover:underline">
                            {c.name || "Unknown client"}
                          </Link>
                          {c.highWorkload && (
                            <Badge tone="warning">
                              <AlertTriangle className="size-3" /> High workload
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 h-1 w-full max-w-40 overflow-hidden rounded-full bg-surface-3">
                          <div className="h-full rounded-full bg-fg/70" style={{ width: `${(c.revenueCents / maxClientRev) * 100}%` }} />
                        </div>
                      </TD>
                      <TD className="tabular text-right">{formatMoney(c.revenueCents)}</TD>
                      <TD className="tabular hidden text-right text-muted md:table-cell">{c.expenseCents ? formatMoney(c.expenseCents) : "—"}</TD>
                      <TD className="tabular hidden text-right text-muted sm:table-cell">{c.minutes ? hours(c.minutes) : "—"}</TD>
                      {rateCents ? <TD className="tabular hidden text-right text-muted lg:table-cell">{c.labourCents !== null ? formatMoney(c.labourCents) : "—"}</TD> : null}
                      <TD className={cn("tabular text-right font-medium", c.profitCents < 0 && "text-danger")}>{formatMoney(c.profitCents)}</TD>
                      <TD className="tabular text-right">{c.effectiveHourlyCents !== null ? formatMoney(c.effectiveHourlyCents) : <span className="text-subtle">no time</span>}</TD>
                      <TD className="tabular hidden text-right text-muted md:table-cell">{c.videosDelivered || "—"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
            <p className="border-t border-border px-4 py-2.5 text-xs text-subtle">
              {a.hasTime
                ? `“High workload” = 5h+ logged and an effective rate under half the median${a.medianHourlyCents ? ` (${formatMoney(a.medianHourlyCents)}/h)` : ""}. Effective rate = (revenue − linked expenses) ÷ logged hours.`
                : "Log time on clients or videos to see effective hourly earnings and workload flags."}
            </p>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title={<>Upcoming contracted revenue<Est>Contracted · estimate</Est></>} description="Active monthly retainers from next month: until their end date (max 12 months), or 3 months if open-ended." />
              <CardBody>
                {a.contracted.items.length === 0 ? (
                  <p className="text-[13px] text-muted">No active monthly retainers.</p>
                ) : (
                  <>
                    <div className="tabular mb-3 text-2xl font-semibold tracking-tight">{formatMoney(a.contracted.totalCents)}</div>
                    <ul className="divide-y divide-border text-[13px]">
                      {a.contracted.items.map((c) => (
                        <li key={c.packageId} className="flex items-center justify-between gap-3 py-2">
                          <div className="min-w-0">
                            <Link href={`/clients/${c.clientId}`} className="font-medium hover:underline">
                              {c.clientName}
                            </Link>
                            <div className="truncate text-xs text-subtle">
                              {c.name} · {formatMoney(c.monthlyCents)}/mo × {c.months}
                              {c.openEnded ? " (open-ended, assumed)" : ""}
                            </div>
                          </div>
                          <span className="tabular">{formatMoney(c.totalCents)}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-subtle">Uses the package price as entered; check whether it includes VAT.</p>
                  </>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title={<>VAT & tax<Est /></>} description={range.label} />
              <CardBody className="flex flex-col gap-2 text-[13px]">
                <Line label="Output VAT on issued invoices" value={formatMoney(s.outputVat)} />
                <Line label="Reclaimable input VAT on expenses" value={`− ${formatMoney(s.inputVat)}`} />
                <div className="flex justify-between border-t border-border pt-2 font-medium">
                  <span>Estimated VAT payable</span>
                  <span className="tabular">{formatMoney(s.vatPayableEstimate)}</span>
                </div>
                <div className="mt-2 flex justify-between">
                  <span className="text-muted">Estimated income tax ({formatRateBp(settings.estimatedTaxRateBp)} of operating profit)</span>
                  <span className="tabular">{formatMoney(s.estimatedTax)}</span>
                </div>
                <p className="mt-2 rounded-md bg-surface-2 px-2.5 py-2 text-xs text-muted">
                  Estimate — not accounting advice. Uses VAT as recorded and a flat rate set in Settings; it ignores allowances, capital-allowance rules, tax bands and timing. Confirm figures with your accountant.
                </p>
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function Kpi({ label, value, sub, tone, href }: { label: string; value: string; sub?: string; tone?: "danger"; href?: string }) {
  const inner = (
    <>
      <div className="text-xs text-muted">{label}</div>
      <div className={cn("tabular mt-1 text-lg font-semibold tracking-tight", tone === "danger" && "text-danger")}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-subtle">{sub}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="bg-surface p-4 transition-colors hover:bg-surface-2/60">
      {inner}
    </Link>
  ) : (
    <div className="bg-surface p-4">{inner}</div>
  );
}

function Mini({ label, value, sub }: { label: React.ReactNode; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted">{label}</div>
      <div className="tabular mt-0.5 text-sm font-semibold">{value}</div>
      {sub && <div className="truncate text-[11px] text-subtle">{sub}</div>}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
