import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Plus, Receipt } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/server/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { loadInvoiceRows, outstandingInvoices } from "@/server/finance/queries";
import { clientOptions } from "@/server/lookups";
import { dbDate, endOfMonthPlain, fmtDate, startOfMonthPlain, todayMalta } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { PeriodPicker } from "@/components/finance/period-picker";
import { resolvePeriod } from "@/components/finance/period";
import { FilterBar } from "@/components/finance/filter-bar";
import { InvoiceStatusBadge } from "@/components/finance/invoice-status";
import { INVOICE_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser("finance:view");
  const sp = await searchParams;
  if (sp.new) redirect("/invoices/new");
  const period = resolvePeriod(sp.period, "all");
  const today = todayMalta();
  const where: Prisma.InvoiceWhereInput = {};
  if (period.from && period.to) where.issueDate = { gte: dbDate(period.from), lte: dbDate(period.to) };
  if (sp.client) where.clientId = sp.client;
  if (sp.q) {
    const ci = { contains: sp.q, mode: "insensitive" as const };
    where.OR = [{ number: ci }, { description: ci }, { client: { name: ci } }];
  }
  const monthFrom = startOfMonthPlain(today);
  const monthTo = endOfMonthPlain(today);
  const [allRows, outstanding, clients, monthRows, paidThisMonth] = await Promise.all([
    loadInvoiceRows(where, today),
    outstandingInvoices(today),
    clientOptions(true),
    loadInvoiceRows({ status: "SENT", issueDate: { gte: dbDate(monthFrom), lte: dbDate(monthTo) } }, today),
    db.payment.aggregate({ _sum: { amountCents: true }, where: { paidOn: { gte: dbDate(monthFrom), lte: dbDate(monthTo) }, invoice: { status: { not: "CANCELLED" } } } }),
  ]);
  const matchStatus = (r: (typeof allRows)[number]) => {
    if (sp.status === "UNPAID") return r.status === "SENT" && r.state.balanceCents > 0;
    if (sp.status === "PARTIALLY_PAID") return r.state.status === "PARTIALLY_PAID" || (r.state.status === "OVERDUE" && r.state.paidCents > 0);
    return r.state.status === sp.status;
  };
  const rows = sp.status ? allRows.filter(matchStatus) : allRows;
  const canEdit = can(user.role, "finance:edit");
  const totals = rows.reduce(
    (a, r) => (r.status === "CANCELLED" || r.status === "DRAFT" ? a : { total: a.total + r.totalCents, paid: a.paid + r.state.paidCents, balance: a.balance + r.state.balanceCents }),
    { total: 0, paid: 0, balance: 0 },
  );
  const exportHref = `/api/export/invoices${period.from ? `?from=${period.from}&to=${period.to}` : ""}`;

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Payment status is calculated from recorded payments only — a due date never marks an invoice as paid."
        actions={
          <>
            <Button asChild size="md">
              <a href={exportHref}>
                <Download /> Export CSV
              </a>
            </Button>
            {canEdit && (
              <Button asChild variant="primary">
                <Link href="/invoices/new">
                  <Plus /> New invoice
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
        <Summary label="Outstanding" value={formatMoney(outstanding.totalCents)} sub={`${outstanding.count} unpaid ${outstanding.count === 1 ? "invoice" : "invoices"}`} href="/invoices?status=UNPAID" />
        <Summary
          label="Overdue"
          value={formatMoney(outstanding.overdueCents)}
          sub={outstanding.overdueCount ? `${outstanding.overdueCount} past due` : "Nothing overdue"}
          tone={outstanding.overdueCount ? "danger" : undefined}
          href="/invoices?status=OVERDUE"
        />
        <Summary label="Collected this month" value={formatMoney(paidThisMonth._sum.amountCents ?? 0)} sub="Payments received" />
        <Summary label="Invoiced this month" value={formatMoney(monthRows.reduce((s, r) => s + r.totalCents, 0))} sub={`${monthRows.length} issued · incl. VAT`} />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <FilterBar
          placeholder="Search number, client…"
          selects={[
            { name: "status", label: "All statuses", options: [{ value: "UNPAID", label: "Unpaid (any)" }, ...Object.entries(INVOICE_STATUS).map(([value, s]) => ({ value, label: s.label }))] },
            { name: "client", label: "All clients", options: clients },
          ]}
        />
        <PeriodPicker value={period.key} label={period.label} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={allRows.length === 0 && !sp.q && !sp.client && period.kind === "all" ? "No invoices yet" : "No invoices match"}
          description={allRows.length === 0 && period.kind === "all" ? "Record your first invoice to start tracking what you're owed." : "Try a different period or clear the filters."}
          action={
            canEdit && allRows.length === 0 ? (
              <Button asChild variant="primary">
                <Link href="/invoices/new">
                  <Plus /> New invoice
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH>Number</TH>
                <TH>Client</TH>
                <TH className="hidden md:table-cell">Issued</TH>
                <TH className="hidden sm:table-cell">Due</TH>
                <TH className="hidden text-right sm:table-cell">Total</TH>
                <TH className="hidden text-right lg:table-cell">Paid</TH>
                <TH className="text-right">Balance</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id} className={cn("hover:bg-surface-2/60", r.status === "CANCELLED" && "text-subtle")}>
                  <TD className="whitespace-nowrap font-medium">
                    <Link href={`/invoices/${r.id}`} className="tabular hover:underline">
                      {r.number}
                    </Link>
                  </TD>
                  <TD className="max-w-32 truncate sm:max-w-48">
                    <Link href={`/clients/${r.clientId}?tab=finances`} className="hover:underline">
                      {r.clientName}
                    </Link>
                    {r.description && <div className="truncate text-xs text-subtle">{r.description}</div>}
                  </TD>
                  <TD className="tabular hidden text-muted md:table-cell">{fmtDate(r.issueDate, "d MMM yy")}</TD>
                  <TD className={cn("tabular hidden sm:table-cell", r.state.overdue ? "text-danger" : "text-muted")}>{fmtDate(r.dueDate, "d MMM yy")}</TD>
                  <TD className={cn("tabular hidden text-right sm:table-cell", r.status === "CANCELLED" && "line-through")}>{formatMoney(r.totalCents)}</TD>
                  <TD className="tabular hidden text-right text-muted lg:table-cell">{r.state.paidCents ? formatMoney(r.state.paidCents) : "—"}</TD>
                  <TD className="tabular text-right font-medium">{r.status === "SENT" && r.state.balanceCents > 0 ? formatMoney(r.state.balanceCents) : <span className="text-subtle">—</span>}</TD>
                  <TD>
                    <InvoiceStatusBadge state={r.state} />
                  </TD>
                </TR>
              ))}
            </TBody>
            <tfoot>
              <tr className="border-t border-border bg-surface-2/50 text-[13px]">
                <td className="h-10 pl-4 text-xs text-muted" colSpan={2}>
                  {rows.length} {rows.length === 1 ? "invoice" : "invoices"} · issued only
                </td>
                <td className="hidden md:table-cell" />
                <td className="hidden sm:table-cell" />
                <td className="tabular hidden px-3 text-right font-medium sm:table-cell">{formatMoney(totals.total)}</td>
                <td className="tabular hidden px-3 text-right text-muted lg:table-cell">{formatMoney(totals.paid)}</td>
                <td className="tabular px-3 text-right font-medium">{formatMoney(totals.balance)}</td>
                <td />
              </tr>
            </tfoot>
          </Table>
        </Card>
      )}
    </>
  );
}

function Summary({ label, value, sub, tone, href }: { label: string; value: string; sub?: string; tone?: "danger"; href?: string }) {
  const inner = (
    <>
      <div className="text-xs text-muted">{label}</div>
      <div className={cn("tabular mt-1 text-xl font-semibold tracking-tight", tone === "danger" && "text-danger")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-subtle">{sub}</div>}
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
