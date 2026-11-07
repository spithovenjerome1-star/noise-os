import Link from "next/link";
import { Plus, Pencil, Clock } from "lucide-react";
import { db } from "@/lib/db";
import { fmtDate, plainOf, todayMalta } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { paymentState } from "@/lib/domain/invoices";
import { expenseCost } from "@/lib/domain/finance";
import { EXPENSE_CATEGORY, INVOICE_STATUS } from "@/lib/labels";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Stat } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TimeEntryDialog } from "@/components/clients/workspace-ui";
import { cn } from "@/lib/utils";

function hours(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export async function FinancesTab({ clientId, canEdit }: { clientId: string; canEdit: boolean }) {
  const today = todayMalta();
  const [invoices, expenses, time, videos] = await Promise.all([
    db.invoice.findMany({ where: { clientId }, include: { payments: { select: { amountCents: true } } }, orderBy: { issueDate: "desc" } }),
    db.expense.findMany({ where: { clientId }, orderBy: { date: "desc" } }),
    db.timeEntry.findMany({ where: { clientId }, orderBy: { date: "desc" }, include: { video: { select: { title: true } }, user: { select: { name: true } } } }),
    db.video.findMany({ where: { clientId }, select: { id: true, title: true }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);

  const rows = invoices.map((i) => ({ i, s: paymentState({ status: i.status, totalCents: i.totalCents, dueDate: plainOf(i.dueDate)! }, i.payments, today) }));
  const issued = rows.filter((r) => r.i.status === "SENT");
  const invoicedGross = issued.reduce((s, r) => s + r.i.totalCents, 0);
  const revenueNet = issued.reduce((s, r) => s + r.i.subtotalCents, 0);
  const paid = issued.reduce((s, r) => s + r.s.paidCents, 0);
  const outstanding = issued.reduce((s, r) => s + r.s.balanceCents, 0);
  const overdue = issued.filter((r) => r.s.overdue).reduce((s, r) => s + r.s.balanceCents, 0);
  const directCosts = expenses.reduce(
    (s, e) => s + expenseCost({ date: plainOf(e.date)!, amountCents: e.amountCents, vatCents: e.vatCents, vatReclaimable: e.vatReclaimable, businessUsePct: e.businessUsePct }),
    0,
  );
  const totalMinutes = time.reduce((s, t) => s + t.minutes, 0);
  const effectiveHourly = totalMinutes >= 60 ? Math.round((revenueNet - directCosts) / (totalMinutes / 60)) : null;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardBody className="grid grid-cols-2 gap-4 pt-4 md:grid-cols-5">
          <Stat label="Invoiced (incl. VAT)" value={formatMoney(invoicedGross)} sub={`${formatMoney(revenueNet)} net`} />
          <Stat label="Paid" value={formatMoney(paid)} />
          <Stat label="Outstanding" value={<span className={cn(outstanding > 0 && "text-fg")}>{formatMoney(outstanding)}</span>} />
          <Stat label="Overdue" value={<span className={cn(overdue > 0 && "text-danger")}>{formatMoney(overdue)}</span>} />
          <Stat
            label={<span>Effective hourly <Badge className="ml-1">Estimate</Badge></span>}
            value={effectiveHourly !== null ? `${formatMoney(effectiveHourly)}/h` : "—"}
            sub={effectiveHourly !== null ? `(net revenue − direct costs) ÷ ${hours(totalMinutes)}` : "Log at least 1 hour to estimate"}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Invoices"
          action={canEdit && <Button size="sm" variant="ghost" asChild><Link href={`/invoices/new?client=${clientId}`}><Plus /> New invoice</Link></Button>}
        />
        {rows.length === 0 ? (
          <CardBody><p className="text-[13px] text-muted">No invoices for this client yet.</p></CardBody>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Number</TH>
                <TH className="hidden sm:table-cell">Issued</TH>
                <TH className="hidden sm:table-cell">Due</TH>
                <TH>Status</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-right">Balance</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map(({ i, s }) => (
                <TR key={i.id} className="hover:bg-surface-2/60">
                  <TD>
                    <Link href={`/invoices/${i.id}`} className="font-medium hover:underline">{i.number}</Link>
                    {i.description && <div className="max-w-56 truncate text-xs text-subtle">{i.description}</div>}
                  </TD>
                  <TD className="hidden text-muted sm:table-cell">{fmtDate(plainOf(i.issueDate))}</TD>
                  <TD className="hidden text-muted sm:table-cell">{fmtDate(plainOf(i.dueDate))}</TD>
                  <TD>
                    <Badge tone={INVOICE_STATUS[s.status].tone}>{INVOICE_STATUS[s.status].label}</Badge>
                    {s.overdue && s.paidCents > 0 && <span className="ml-1 text-xs text-muted">(part paid)</span>}
                  </TD>
                  <TD className="tabular text-right">{formatMoney(i.totalCents)}</TD>
                  <TD className={cn("tabular text-right", s.overdue && "text-danger")}>{s.status === "CANCELLED" ? "—" : formatMoney(s.balanceCents)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Linked expenses" description={expenses.length ? `${formatMoney(directCosts)} business cost` : undefined} />
          {expenses.length === 0 ? (
            <CardBody><p className="text-[13px] text-muted">No expenses linked to this client.</p></CardBody>
          ) : (
            <Table>
              <TBody>
                {expenses.slice(0, 20).map((e) => (
                  <TR key={e.id}>
                    <TD>
                      <Link href={`/expenses?expense=${e.id}`} className="hover:underline">{e.description}</Link>
                      <div className="text-xs text-subtle">{EXPENSE_CATEGORY[e.category]} · {fmtDate(plainOf(e.date), "d MMM yyyy")}</div>
                    </TD>
                    <TD className="tabular text-right">{formatMoney(e.amountCents)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Time tracking"
            description={totalMinutes ? `${hours(totalMinutes)} logged in total` : "Optional — used for profitability estimates"}
            action={<TimeEntryDialog clientId={clientId} videos={videos.map((v) => ({ value: v.id, label: v.title }))} today={today} trigger={<Button size="sm" variant="ghost"><Clock /> Log time</Button>} />}
          />
          {time.length === 0 ? (
            <CardBody><p className="text-[13px] text-muted">No time logged yet.</p></CardBody>
          ) : (
            <Table>
              <TBody>
                {time.slice(0, 30).map((t) => (
                  <TR key={t.id}>
                    <TD className="text-muted">{fmtDate(plainOf(t.date), "d MMM")}</TD>
                    <TD>
                      <div className="text-[13px]">{t.note ?? "—"}</div>
                      <div className="text-xs text-subtle">{[t.user?.name, t.video?.title].filter(Boolean).join(" · ")}</div>
                    </TD>
                    <TD className="tabular text-right">{hours(t.minutes)}</TD>
                    <TD className="w-8">
                      <TimeEntryDialog
                        clientId={clientId}
                        today={today}
                        videos={videos.map((v) => ({ value: v.id, label: v.title }))}
                        entry={{ id: t.id, date: plainOf(t.date)!, minutes: t.minutes, note: t.note, videoId: t.videoId }}
                        trigger={<Button variant="ghost" size="icon-sm" aria-label="Edit time entry"><Pencil /></Button>}
                      />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
