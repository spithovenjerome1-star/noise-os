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

const ACCENT = "#5BC4EA";

// A4 invoice matching NOISE's existing invoice design. Use the browser's "Save as PDF" to produce the PDF file.
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
      <style>{`@page { size: A4; margin: 14mm 14mm 16mm; } @media print { html, body { background: white !important; color: #111 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4 text-[13px] text-muted">
        <span>Tip: choose “Save as PDF” as the destination.</span>
        <PrintButton />
      </div>
      <article className="relative mx-auto flex min-h-[297mm] max-w-[210mm] flex-col bg-white px-[14mm] pb-[22mm] pt-[12mm] text-[13px] leading-relaxed text-zinc-900 shadow-pop print:min-h-[254mm] print:max-w-none print:p-0 print:shadow-none">
        {inv.status === "CANCELLED" && <div className="mb-6 rounded border border-red-300 px-3 py-2 text-center font-semibold uppercase tracking-widest text-red-600">Cancelled</div>}
        {inv.status === "DRAFT" && <div className="mb-6 rounded border border-zinc-300 px-3 py-2 text-center font-semibold uppercase tracking-widest text-zinc-500">Draft — not a valid invoice</div>}

        <header className="grid grid-cols-2 gap-10">
          <div>
            <Logo name={s.businessName} />
            <h2 className="mt-4 text-[22px] font-bold">Contact</h2>
            <div className="mt-1 whitespace-pre-line text-[14px] leading-[1.55]">
              {[s.phone, s.email, s.address].filter(Boolean).join("\n")}
              {s.vatNumber ? `\nVAT: ${s.vatNumber}` : ""}
            </div>
          </div>
          <div className="pt-1">
            <h1 className="text-[30px] font-bold leading-none">Invoice</h1>
            <div className="mt-2 h-1.5 w-32" style={{ background: ACCENT }} />
            <div className="mt-2 text-[14px] leading-[1.6]">
              <div>Invoice NO: <span className="tabular-nums">{inv.number}</span></div>
              <div>Date: {fmtDate(inv.issueDate, "MMMM do, yyyy")}</div>
            </div>
            <div className="mt-6 text-[14px] font-bold">Billed to:</div>
            <div className="mt-1 whitespace-pre-line text-[14px] leading-[1.55]">
              {[billTo, inv.client.companyName && inv.client.contactPerson ? `Attn: ${inv.client.contactPerson}` : null, inv.client.billingAddress].filter(Boolean).join("\n")}
              {inv.client.vatNumber ? `\nVAT No: ${inv.client.vatNumber}` : ""}
            </div>
          </div>
        </header>

        <table className="mt-8 w-full border-collapse">
          <thead>
            <tr className="text-left text-[15px]">
              <th className="pb-2 font-bold">Description</th>
              <th className="w-24 pb-2 text-center font-bold">Hours</th>
              <th className="w-24 pb-2 text-center font-bold">Rate</th>
              <th className="w-36 pb-2 text-center font-bold">Amount</th>
            </tr>
            <tr><td colSpan={4} className="p-0"><div className="h-[3px]" style={{ background: ACCENT }} /></td></tr>
          </thead>
          <tbody>
            {inv.lines.map((l) => {
              const [title, ...rest] = l.description.split("\n").map((x) => x.trim()).filter(Boolean);
              const showQty = l.qtyHundredths !== 100;
              return (
                <tr key={l.id} className="align-top text-[14px]">
                  <td className="pt-4 pr-4">
                    <div>{title}</div>
                    {rest.length > 0 && (
                      <ul className="mt-0.5 list-disc pl-9 leading-[1.6]">
                        {rest.map((r, i) => <li key={i}>{r.replace(/^[-•*]\s*/, "")}</li>)}
                      </ul>
                    )}
                  </td>
                  <td className="pt-4 text-center tabular-nums">{showQty ? l.qtyHundredths / 100 : ""}</td>
                  <td className="pt-4 text-center tabular-nums">{showQty ? formatMoney(l.unitCents) : ""}</td>
                  <td className="pt-4 text-right tabular-nums">{formatMoney(l.netCents)}(EUR)</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-auto pt-16">
          <div className="h-[3px]" style={{ background: ACCENT }} />
          <div className="mt-4 grid grid-cols-2 gap-10">
            <div className="text-[14px]">
              Due Date: {fmtDate(inv.dueDate, "do MMMM yyyy")}
              {inv.description && <p className="mt-3 text-zinc-600">{inv.description}</p>}
            </div>
            <div>
              {inv.vatNote && <p className="whitespace-pre-line text-[13px] font-bold leading-snug">{inv.vatNote}</p>}
              {inv.vatCents > 0 && (
                <div className="mt-3 text-[13px]">
                  <Row label="Subtotal" value={formatMoney(inv.subtotalCents)} />
                  {totals.byRate.filter((r) => r.vatCents > 0).map((r) => (
                    <Row key={r.rateBp} label={`VAT ${formatRateBp(r.rateBp)}`} value={formatMoney(r.vatCents)} />
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-center justify-between rounded-md px-3.5 py-2.5 text-[16px] font-bold" style={{ background: ACCENT }}>
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(inv.totalCents)}</span>
              </div>
              {state.paidCents > 0 && inv.status === "SENT" && (
                <div className="mt-2 px-3.5 text-[13px]">
                  <Row label="Paid" value={`− ${formatMoney(state.paidCents)}`} />
                  <div className="flex justify-between font-semibold"><span>Balance due</span><span className="tabular-nums">{formatMoney(state.balanceCents)}</span></div>
                </div>
              )}
              {(s.iban || s.legalName || s.invoiceFooter) && (
                <>
                  <h2 className="mt-6 text-[22px] font-bold">Payment Info</h2>
                  <div className="mt-1 whitespace-pre-line text-[14px] leading-[1.6]">
                    {[s.legalName, s.invoiceFooter, s.iban ? `Account No:\n${s.iban}` : null].filter(Boolean).join("\n")}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-4 print:fixed" style={{ background: ACCENT }} />
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

function Logo({ name }: { name: string }) {
  return (
    <div className="inline-flex flex-col items-center">
      <svg viewBox="0 0 100 100" className="h-[84px] w-[84px]" aria-hidden>
        <path d="M18 4h20l28 52V4h20v92H66L38 44v52H18z" fill="#000" />
      </svg>
      <span className="-mt-1 text-[11px] font-black tracking-tight">{name.toUpperCase()}.MT</span>
    </div>
  );
}
