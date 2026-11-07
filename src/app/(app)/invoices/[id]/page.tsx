import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { can } from "@/lib/permissions";
import { fmtDate, fmtMoment, plainOf, todayMalta } from "@/lib/dates";
import { formatMoney, formatRateBp } from "@/lib/money";
import { invoiceTotals, paymentState } from "@/lib/domain/invoices";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { InvoiceStatusBadge } from "@/components/finance/invoice-status";
import { InvoiceActionsBar } from "@/components/finance/invoice-actions-bar";
import { PaymentList } from "@/components/finance/payment-list";
import { AttachmentList, UploadButton } from "@/components/attachments";
import { Progress } from "@/components/ui/misc";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const inv = await db.invoice.findUnique({ where: { id: (await params).id }, select: { number: true } });
  return { title: inv?.number ?? "Invoice" };
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("finance:view");
  const { id } = await params;
  const inv = await db.invoice.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, companyName: true, email: true } },
      project: { select: { name: true } },
      packagePeriod: { select: { startDate: true, endDate: true, package: { select: { name: true } } } },
      lines: { orderBy: { position: "asc" } },
      payments: { orderBy: { paidOn: "asc" } },
      attachments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!inv) notFound();
  const today = todayMalta();
  const state = paymentState({ status: inv.status, totalCents: inv.totalCents, dueDate: plainOf(inv.dueDate)! }, inv.payments, today);
  const totals = invoiceTotals(inv.lines);
  const canEdit = can(user.role, "finance:edit");
  const activity = await db.activityLog.findMany({ where: { entityType: "invoice", entityId: id }, orderBy: { createdAt: "desc" }, take: 12 });
  const paidPct = inv.totalCents > 0 ? Math.min(100, (state.paidCents / inv.totalCents) * 100) : 0;

  return (
    <>
      <Link href="/invoices" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        <ChevronLeft className="size-3.5" /> Invoices
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="tabular text-xl font-semibold tracking-tight">{inv.number}</h1>
            <InvoiceStatusBadge state={state} />
          </div>
          <p className="mt-1 text-[13px] text-muted">
            <Link href={`/clients/${inv.client.id}?tab=finances`} className="hover:text-fg hover:underline">
              {inv.client.name}
            </Link>
            {inv.description ? ` · ${inv.description}` : ""}
          </p>
        </div>
        <InvoiceActionsBar id={inv.id} status={inv.status} hasPayments={inv.payments.length > 0} canEdit={canEdit} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
              <Meta label="Issued" value={fmtDate(inv.issueDate)} />
              <Meta label="Due" value={fmtDate(inv.dueDate)} tone={state.overdue ? "danger" : undefined} sub={state.overdue ? `${state.daysOverdue} days overdue` : undefined} />
              <Meta label="Project" value={inv.project?.name ?? "—"} />
              <Meta
                label="Package period"
                value={inv.packagePeriod ? inv.packagePeriod.package.name : "—"}
                sub={inv.packagePeriod ? `${fmtDate(inv.packagePeriod.startDate, "d MMM")} – ${fmtDate(inv.packagePeriod.endDate, "d MMM yy")}` : undefined}
              />
            </div>
          </Card>

          <Card className="overflow-hidden">
            <Table>
              <THead>
                <TR>
                  <TH>Description</TH>
                  <TH className="text-right">Qty</TH>
                  <TH className="text-right">Unit</TH>
                  <TH className="text-right">VAT</TH>
                  <TH className="text-right">Amount</TH>
                </TR>
              </THead>
              <TBody>
                {inv.lines.map((l) => (
                  <TR key={l.id}>
                    <TD className="whitespace-pre-wrap">{l.description}</TD>
                    <TD className="tabular text-right text-muted">{l.qtyHundredths / 100}</TD>
                    <TD className="tabular text-right text-muted">{formatMoney(l.unitCents)}</TD>
                    <TD className="tabular text-right text-muted">{formatRateBp(l.vatRateBp)}</TD>
                    <TD className="tabular text-right">{formatMoney(l.netCents)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="ml-auto flex w-full max-w-xs flex-col gap-1.5 border-t border-border p-4 text-[13px]">
              <Line label="Subtotal" value={formatMoney(inv.subtotalCents)} />
              {totals.byRate.map((r) => (
                <Line key={r.rateBp} label={`VAT ${formatRateBp(r.rateBp)}`} value={formatMoney(r.vatCents)} />
              ))}
              <div className="mt-1 flex justify-between border-t border-border pt-2 text-sm font-semibold">
                <span>Total</span>
                <span className="tabular">{formatMoney(inv.totalCents)}</span>
              </div>
            </div>
            {inv.vatNote && <p className="border-t border-border px-4 py-3 text-xs text-muted">VAT note: {inv.vatNote}</p>}
          </Card>

          {inv.notes && (
            <Card>
              <CardHeader title="Internal notes" description="Never shown to the client" />
              <CardBody className="whitespace-pre-wrap text-[13px] text-muted">{inv.notes}</CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Activity" />
            <CardBody>
              {activity.length === 0 ? (
                <p className="text-[13px] text-muted">No activity yet.</p>
              ) : (
                <ol className="flex flex-col gap-2.5">
                  {activity.map((a) => (
                    <li key={a.id} className="flex gap-3 text-[13px]">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-border-strong" />
                      <span className="flex-1">{a.summary}</span>
                      <span className="shrink-0 text-xs text-subtle">{fmtMoment(a.createdAt, "d MMM, HH:mm")}</span>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Payments" />
            <CardBody>
              <div className="mb-4">
                <div className="flex items-baseline justify-between">
                  <span className="tabular text-2xl font-semibold tracking-tight">{formatMoney(inv.status === "CANCELLED" ? 0 : state.balanceCents)}</span>
                  <span className="text-xs text-muted">balance</span>
                </div>
                <Progress value={paidPct} tone={state.status === "PAID" ? "success" : "fg"} className="mt-2" />
                <div className="mt-1.5 flex justify-between text-xs text-muted">
                  <span className="tabular">{formatMoney(state.paidCents)} paid</span>
                  <span className="tabular">of {formatMoney(inv.totalCents)}</span>
                </div>
                {state.overpaidCents > 0 && <p className="mt-2 rounded-md bg-warning-bg px-2 py-1.5 text-xs text-warning">Overpaid by {formatMoney(state.overpaidCents)}. Check the recorded payments or plan a refund/credit.</p>}
                {inv.status === "DRAFT" && <p className="mt-2 text-xs text-subtle">Draft — recording a payment marks it as sent.</p>}
              </div>
              <PaymentList
                invoiceId={inv.id}
                today={today}
                cancelled={inv.status === "CANCELLED"}
                balanceCents={state.balanceCents}
                canEdit={canEdit}
                payments={inv.payments.map((p) => ({ id: p.id, amountCents: p.amountCents, paidOn: plainOf(p.paidOn)!, method: p.method, reference: p.reference, notes: p.notes }))}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Files" description="Invoice PDF and related documents" action={canEdit ? <UploadButton target={{ invoiceId: inv.id }} kind="INVOICE_PDF" label="Attach" accept="application/pdf,image/*" /> : undefined} />
            <CardBody>
              <AttachmentList items={inv.attachments} canEdit={canEdit} />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function Meta({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "danger" }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-subtle">{label}</div>
      <div className={`mt-0.5 truncate text-[13px] ${tone === "danger" ? "text-danger" : ""}`}>{value}</div>
      {sub && <div className={`truncate text-xs ${tone === "danger" ? "text-danger" : "text-subtle"}`}>{sub}</div>}
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
