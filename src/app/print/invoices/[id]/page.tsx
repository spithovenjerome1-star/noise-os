import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { fmtDate, plainOf, todayMalta } from "@/lib/dates";
import { formatMoney, formatRateBp } from "@/lib/money";
import { invoiceTotals, paymentState } from "@/lib/domain/invoices";
import { PrintButton } from "./print-button";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const inv = await db.invoice.findUnique({ where: { id: (await params).id }, select: { number: true } });
  return { title: inv ? `Invoice ${inv.number}` : "Invoice" };
}

// Clean A4 invoice. Use the browser's "Save as PDF" to produce the PDF file.
export default async function PrintInvoice({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("finance:view");
  const { id } = await params;
  const [inv, s] = await Promise.all([
    db.invoice.findUnique({
      where: { id },
      include: {
        client: { select: { name: true, companyName: true, contactPerson: true, email: true, billingAddress: true, vatNumber: true } },
        lines: { orderBy: { position: "asc" } },
        payments: { select: { amountCents: true } },
      },
    }),
    getSettings(),
  ]);
  if (!inv) notFound();
  const totals = invoiceTotals(inv.lines);
  const state = paymentState({ status: inv.status, totalCents: inv.totalCents, dueDate: plainOf(inv.dueDate)! }, inv.payments, todayMalta());
  const billTo = inv.client.companyName || inv.client.name;

  return (
    <div className="min-h-dvh bg-surface-2 py-8 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 16mm; } @media print { html, body { background: white !important; color: #111 !important; } }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4 text-[13px] text-muted">
        <span>Tip: choose “Save as PDF” as the destination.</span>
        <PrintButton />
      </div>
      <article className="mx-auto max-w-[210mm] bg-white p-[16mm] text-[12px] leading-relaxed text-zinc-900 shadow-pop print:max-w-none print:p-0 print:shadow-none">
        {inv.status === "CANCELLED" && <div className="mb-6 rounded border border-red-300 px-3 py-2 text-center font-semibold uppercase tracking-widest text-red-600">Cancelled</div>}
        {inv.status === "DRAFT" && <div className="mb-6 rounded border border-zinc-300 px-3 py-2 text-center font-semibold uppercase tracking-widest text-zinc-500">Draft — not a valid invoice</div>}
        <header className="flex items-start justify-between gap-8">
          <div>
            <div className="text-2xl font-black tracking-tighter">{s.businessName}</div>
            <div className="mt-2 whitespace-pre-line text-zinc-500">
              {[s.legalName, s.address, s.email, s.phone].filter(Boolean).join("\n")}
              {s.vatNumber ? `\nVAT ${s.vatNumber}` : ""}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">Invoice</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{inv.number}</div>
            <dl className="mt-3 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-left text-zinc-600">
              <dt>Issue date</dt>
              <dd className="text-right tabular-nums">{fmtDate(inv.issueDate)}</dd>
              <dt>Due date</dt>
              <dd className="text-right tabular-nums">{fmtDate(inv.dueDate)}</dd>
            </dl>
          </div>
        </header>

        <section className="mt-10">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">Bill to</div>
          <div className="mt-1 font-semibold">{billTo}</div>
          <div className="whitespace-pre-line text-zinc-600">
            {[inv.client.companyName && inv.client.contactPerson ? `Attn: ${inv.client.contactPerson}` : null, inv.client.billingAddress, inv.client.email].filter(Boolean).join("\n")}
            {inv.client.vatNumber ? `\nVAT ${inv.client.vatNumber}` : ""}
          </div>
          {inv.description && <p className="mt-4 font-medium">{inv.description}</p>}
        </section>

        <table className="mt-8 w-full border-collapse">
          <thead>
            <tr className="border-b border-zinc-900 text-left text-[11px] uppercase tracking-wider text-zinc-500">
              <th className="py-2 font-medium">Description</th>
              <th className="py-2 text-right font-medium">Qty</th>
              <th className="py-2 text-right font-medium">Unit price</th>
              <th className="py-2 text-right font-medium">VAT</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l) => (
              <tr key={l.id} className="border-b border-zinc-200 align-top">
                <td className="whitespace-pre-wrap py-2.5 pr-4">{l.description}</td>
                <td className="py-2.5 text-right tabular-nums">{l.qtyHundredths / 100}</td>
                <td className="py-2.5 text-right tabular-nums">{formatMoney(l.unitCents)}</td>
                <td className="py-2.5 text-right tabular-nums">{formatRateBp(l.vatRateBp)}</td>
                <td className="py-2.5 text-right tabular-nums">{formatMoney(l.netCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 ml-auto w-72">
          <Row label="Subtotal" value={formatMoney(inv.subtotalCents)} />
          {totals.byRate.map((r) => (
            <Row key={r.rateBp} label={`VAT ${formatRateBp(r.rateBp)} on ${formatMoney(r.netCents)}`} value={formatMoney(r.vatCents)} />
          ))}
          <div className="mt-2 flex justify-between border-t border-zinc-900 pt-2 text-[14px] font-semibold">
            <span>Total (EUR)</span>
            <span className="tabular-nums">{formatMoney(inv.totalCents)}</span>
          </div>
          {state.paidCents > 0 && inv.status === "SENT" && (
            <>
              <Row label="Paid" value={`− ${formatMoney(state.paidCents)}`} />
              <div className="flex justify-between font-semibold">
                <span>Balance due</span>
                <span className="tabular-nums">{formatMoney(state.balanceCents)}</span>
              </div>
            </>
          )}
        </div>

        {inv.vatNote && <p className="mt-8 text-zinc-600">{inv.vatNote}</p>}

        {(s.iban || s.invoiceFooter) && (
        <footer className="mt-12 border-t border-zinc-200 pt-4 text-zinc-500">
          {s.iban && (
            <p>
              <span className="font-medium text-zinc-700">Payment by bank transfer</span> · IBAN {s.iban} · Reference {inv.number}
            </p>
          )}
          {s.invoiceFooter && <p className="mt-2 whitespace-pre-line">{s.invoiceFooter}</p>}
        </footer>
        )}
      </article>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-0.5 text-zinc-600">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
