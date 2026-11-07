import Link from "next/link";
import { Download, Paperclip, Repeat, Wallet } from "lucide-react";
import type { ExpenseCategory, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { can } from "@/lib/permissions";
import { clientOptions, projectOptions } from "@/server/lookups";
import { getVatRates } from "@/server/settings";
import { dbDate, fmtDate, plainOf, todayMalta } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { expenseCost, reclaimableVat } from "@/lib/domain/finance";
import { EXPENSE_CATEGORY, INTERVAL, PAYMENT_METHOD } from "@/lib/labels";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LinkTabs } from "@/components/ui/tabs";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { PeriodPicker } from "@/components/finance/period-picker";
import { resolvePeriod } from "@/components/finance/period";
import { FilterBar } from "@/components/finance/filter-bar";
import { ExpenseUrlDialog, NewExpenseButton, EditExpenseLink, NewRecurringButton, EditRecurringButton } from "@/components/finance/expense-controls";
import { ActionButton } from "@/components/form";
import { runRecurringNow } from "@/server/finance/expense-actions";
import type { ExpenseData } from "@/components/finance/expense-dialog";
import { cn } from "@/lib/utils";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser("finance:view");
  const sp = await searchParams;
  const tab = sp.tab === "recurring" ? "recurring" : "expenses";
  const canEdit = can(user.role, "finance:edit");
  const today = todayMalta();
  const period = resolvePeriod(sp.period, "month");
  const [clients, projects, vatRatesRaw] = await Promise.all([clientOptions(true), projectOptions(), getVatRates()]);
  const vatRates = vatRatesRaw.map((r) => ({ rateBp: r.rateBp, name: r.name }));
  const defaultVatBp = vatRatesRaw.find((r) => r.isDefault)?.rateBp ?? 0;

  let editing: ExpenseData | undefined;
  if (sp.expense && canEdit) {
    const e = await db.expense.findUnique({ where: { id: sp.expense }, include: { attachments: { orderBy: { createdAt: "desc" } } } });
    if (e) editing = { ...e, date: plainOf(e.date)!, attachments: e.attachments };
  }
  const common = { clients, projects, vatRates, defaultVatBp, today };

  const tabs = (
    <LinkTabs
      active={tab}
      tabs={[
        { key: "expenses", label: "Expenses", href: "/expenses" },
        { key: "recurring", label: "Recurring", href: "/expenses?tab=recurring" },
      ]}
    />
  );

  if (tab === "recurring") {
    const items = await db.recurringExpense.findMany({ orderBy: [{ active: "desc" }, { nextDate: "asc" }], include: { _count: { select: { expenses: true } } } });
    const monthly = items
      .filter((i) => i.active)
      .reduce((s, i) => s + (i.interval === "MONTHLY" ? i.amountCents : i.interval === "YEARLY" ? Math.round(i.amountCents / 12) : Math.round((i.amountCents * 52) / 12)), 0);
    return (
      <>
        <PageHeader
          title="Expenses"
          description="Recurring costs are recorded automatically on their due dates."
          actions={
            canEdit && (
              <>
                <ActionButton action={runRecurringNow}>
                  <Repeat /> Record due now
                </ActionButton>
                <NewRecurringButton vatRates={vatRates} today={today} />
              </>
            )
          }
        >
          {tabs}
        </PageHeader>
        {items.length === 0 ? (
          <EmptyState icon={Repeat} title="No recurring expenses" description="Add subscriptions, insurance, rent or anything you pay on a schedule." />
        ) : (
          <>
            <p className="mb-3 text-[13px] text-muted">
              Active commitments ≈ <span className="tabular font-medium text-fg">{formatMoney(monthly)}</span> per month (gross).
            </p>
            <Card className="overflow-hidden">
              <Table>
                <THead>
                  <TR>
                    <TH>Description</TH>
                    <TH className="hidden sm:table-cell">Category</TH>
                    <TH>Repeats</TH>
                    <TH>Next</TH>
                    <TH className="text-right">Amount</TH>
                    <TH className="hidden text-right md:table-cell">Recorded</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {items.map((i) => (
                    <TR key={i.id} className={cn(!i.active && "text-subtle")}>
                      <TD>
                        <div className="font-medium">{i.description}</div>
                        {i.vendor && <div className="text-xs text-subtle">{i.vendor}</div>}
                      </TD>
                      <TD className="hidden text-muted sm:table-cell">{EXPENSE_CATEGORY[i.category]}</TD>
                      <TD>{i.active ? INTERVAL[i.interval] : <Badge>Paused</Badge>}</TD>
                      <TD className="tabular text-muted">
                        {fmtDate(i.nextDate, "d MMM yy")}
                        {i.endDate && <div className="text-xs text-subtle">until {fmtDate(i.endDate, "d MMM yy")}</div>}
                      </TD>
                      <TD className="tabular text-right">{formatMoney(i.amountCents)}</TD>
                      <TD className="tabular hidden text-right text-muted md:table-cell">{i._count.expenses}×</TD>
                      <TD className="text-right">
                        {canEdit && (
                          <EditRecurringButton
                            vatRates={vatRates}
                            today={today}
                            item={{ ...i, nextDate: plainOf(i.nextDate)!, endDate: plainOf(i.endDate) }}
                          />
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          </>
        )}
      </>
    );
  }

  const where: Prisma.ExpenseWhereInput = {};
  if (period.from && period.to) where.date = { gte: dbDate(period.from), lte: dbDate(period.to) };
  if (sp.category && sp.category in EXPENSE_CATEGORY) where.category = sp.category as ExpenseCategory;
  if (sp.client) where.clientId = sp.client;
  if (sp.q) {
    const ci = { contains: sp.q, mode: "insensitive" as const };
    where.OR = [{ description: ci }, { vendor: ci }, { notes: ci }];
  }
  const [rows, totalCount] = await Promise.all([
    db.expense.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: { client: { select: { id: true, name: true } }, _count: { select: { attachments: true } } },
      take: 500,
    }),
    db.expense.count(),
  ]);
  const fin = rows.map((e) => ({ e, f: { date: plainOf(e.date)!, amountCents: e.amountCents, vatCents: e.vatCents, vatReclaimable: e.vatReclaimable, businessUsePct: e.businessUsePct } }));
  const sum = fin.reduce((a, { e, f }) => ({ gross: a.gross + e.amountCents, cost: a.cost + expenseCost(f), vat: a.vat + reclaimableVat(f) }), { gross: 0, cost: 0, vat: 0 });
  const byCat = new Map<string, number>();
  for (const { e, f } of fin) byCat.set(e.category, (byCat.get(e.category) ?? 0) + expenseCost(f));
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const maxCat = cats[0]?.[1] ?? 0;
  const missingReceipts = rows.filter((r) => r._count.attachments === 0).length;
  const exportHref = `/api/export/expenses${period.from ? `?from=${period.from}&to=${period.to}` : ""}`;

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Business cost = amount paid, minus reclaimable VAT, times business-use share."
        actions={
          <>
            <Button asChild>
              <a href={exportHref}>
                <Download /> Export CSV
              </a>
            </Button>
            {canEdit && <NewExpenseButton />}
          </>
        }
      >
        {tabs}
      </PageHeader>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <FilterBar
          placeholder="Search description, vendor…"
          selects={[
            { name: "category", label: "All categories", options: Object.entries(EXPENSE_CATEGORY).map(([value, label]) => ({ value, label })) },
            { name: "client", label: "All clients", options: clients },
          ]}
        />
        <PeriodPicker value={period.key} label={period.label} />
      </div>

      {totalCount === 0 ? (
        <EmptyState icon={Wallet} title="No expenses yet" description="Track equipment, software, freelancers and other costs to see your real profit." action={canEdit ? <NewExpenseButton /> : undefined} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            {rows.length === 0 ? (
              <EmptyState icon={Wallet} title="No expenses in this view" description="Try another period or clear the filters." />
            ) : (
              <Card className="overflow-hidden">
                <Table>
                  <THead>
                    <TR>
                      <TH>Date</TH>
                      <TH>Description</TH>
                      <TH className="hidden md:table-cell">Category</TH>
                      <TH className="text-right">Paid</TH>
                      <TH className="hidden text-right sm:table-cell">Business cost</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {fin.map(({ e, f }) => (
                      <TR key={e.id} className="hover:bg-surface-2/60">
                        <TD className="tabular whitespace-nowrap text-muted">{fmtDate(e.date, "d MMM")}</TD>
                        <TD className="max-w-72">
                          {canEdit ? (
                            <EditExpenseLink id={e.id} className="max-w-full truncate text-left font-medium hover:underline">
                              {e.description}
                            </EditExpenseLink>
                          ) : (
                            <span className="font-medium">{e.description}</span>
                          )}
                          <div className="flex items-center gap-1.5 truncate text-xs text-subtle">
                            {[e.vendor, e.client?.name, PAYMENT_METHOD[e.paymentMethod]].filter(Boolean).join(" · ")}
                            {e.recurringId && <Repeat className="size-3" aria-label="Recurring" />}
                            {e._count.attachments > 0 && <Paperclip className="size-3" aria-label="Has receipt" />}
                          </div>
                        </TD>
                        <TD className="hidden text-muted md:table-cell">{EXPENSE_CATEGORY[e.category]}</TD>
                        <TD className="tabular text-right">
                          {formatMoney(e.amountCents)}
                          {e.vatCents > 0 && <div className="text-xs text-subtle">VAT {formatMoney(e.vatCents)}</div>}
                        </TD>
                        <TD className="tabular hidden text-right sm:table-cell">
                          {formatMoney(expenseCost(f))}
                          {e.businessUsePct < 100 && <div className="text-xs text-subtle">{e.businessUsePct}% business</div>}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </Card>
            )}
          </div>
          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader title={period.label} description={`${rows.length} ${rows.length === 1 ? "expense" : "expenses"}`} />
              <CardBody className="flex flex-col gap-2.5 text-[13px]">
                <SumLine label="Total paid (gross)" value={formatMoney(sum.gross)} />
                <SumLine label="Reclaimable VAT" value={formatMoney(sum.vat)} />
                <div className="flex justify-between border-t border-border pt-2.5 font-semibold">
                  <span>Business cost</span>
                  <span className="tabular">{formatMoney(sum.cost)}</span>
                </div>
                {missingReceipts > 0 && (
                  <p className="text-xs text-warning">
                    {missingReceipts} {missingReceipts === 1 ? "expense has" : "expenses have"} no receipt attached
                  </p>
                )}
              </CardBody>
            </Card>
            {cats.length > 0 && (
              <Card>
                <CardHeader title="By category" description="Business cost" />
                <CardBody className="flex flex-col gap-3">
                  {cats.map(([cat, v]) => (
                    <Link key={cat} href={`/expenses?period=${period.key}&category=${cat}`} className="group block">
                      <div className="flex justify-between text-[13px]">
                        <span className="text-muted group-hover:text-fg">{EXPENSE_CATEGORY[cat as ExpenseCategory]}</span>
                        <span className="tabular">{formatMoney(v)}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                        <div className="h-full rounded-full bg-fg/70" style={{ width: `${maxCat ? (v / maxCat) * 100 : 0}%` }} />
                      </div>
                    </Link>
                  ))}
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      )}

      {canEdit && <ExpenseUrlDialog expense={editing} openNew={Boolean(sp.new)} {...common} />}
    </>
  );
}

function SumLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
