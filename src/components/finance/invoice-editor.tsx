"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { formatMoney, formatRateBp, parseMoney } from "@/lib/money";
import { invoiceTotals } from "@/lib/domain/invoices";
import { addDaysPlain } from "@/lib/dates";
import { saveInvoice, invoiceClientContext } from "@/server/finance/invoice-actions";
import { cn } from "@/lib/utils";

type Line = { key: string; description: string; qty: string; unit: string; vatRateBp: number };
type Ctx = Awaited<ReturnType<typeof invoiceClientContext>>;

export type InvoiceEditorProps = {
  clients: { value: string; label: string }[];
  vatRates: { id: string; name: string; rateBp: number; isDefault: boolean; note: string | null }[];
  defaults: { issueDate: string; paymentTerms: number; nextNumber: string };
  invoice?: {
    id: string;
    number: string;
    status: "DRAFT" | "SENT" | "CANCELLED";
    clientId: string;
    projectId: string | null;
    packagePeriodId: string | null;
    description: string | null;
    issueDate: string;
    dueDate: string;
    vatNote: string | null;
    notes: string | null;
    lines: { description: string; qty: string; unit: string; vatRateBp: number }[];
  };
  initialClientId?: string;
};

let k = 0;
const key = () => `l${++k}`;

export function InvoiceEditor({ clients, vatRates, defaults, invoice, initialClientId }: InvoiceEditorProps) {
  const router = useRouter();
  const defaultRate = vatRates.find((r) => r.isDefault)?.rateBp ?? vatRates[0]?.rateBp ?? 0;
  const [clientId, setClientId] = React.useState(invoice?.clientId ?? initialClientId ?? "");
  const [ctx, setCtx] = React.useState<Ctx>(null);
  const [issueDate, setIssueDate] = React.useState(invoice?.issueDate ?? defaults.issueDate);
  const [dueDate, setDueDate] = React.useState(invoice?.dueDate ?? addDaysPlain(defaults.issueDate, defaults.paymentTerms));
  const [dueTouched, setDueTouched] = React.useState(Boolean(invoice));
  const [terms, setTerms] = React.useState(defaults.paymentTerms);
  const [lines, setLines] = React.useState<Line[]>(
    invoice?.lines.length ? invoice.lines.map((l, i) => ({ ...l, key: `i${i}` })) : [{ key: "i0", description: "", qty: "1", unit: "", vatRateBp: defaultRate }],
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, start] = React.useTransition();
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (!clientId) {
      setCtx(null);
      return;
    }
    let live = true;
    invoiceClientContext(clientId).then((c) => {
      if (!live || !c) return;
      setCtx(c);
      setTerms(c.paymentTermsDays);
      if (!dueTouched) setDueDate(addDaysPlain(issueDate, c.paymentTermsDays));
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const parsed = lines.map((l) => {
    const q = parseFloat(l.qty.replace(",", "."));
    const u = parseMoney(l.unit);
    return { qtyHundredths: Number.isFinite(q) ? Math.round(q * 100) : 0, unitCents: u ?? 0, vatRateBp: l.vatRateBp };
  });
  const totals = invoiceTotals(parsed);
  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const rateName = (bp: number) => vatRates.find((r) => r.rateBp === bp)?.name ?? formatRateBp(bp);

  const submit = (intent: "draft" | "send" | "save") => {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    fd.set("intent", intent);
    fd.set("lines", JSON.stringify(lines.map(({ description, qty, unit, vatRateBp }) => ({ description, qty, unit, vatRateBp }))));
    start(async () => {
      const r = await saveInvoice(fd);
      if (r.ok) {
        toast.success(r.message ?? "Saved");
        router.push(`/invoices/${r.data!.id}`);
        router.refresh();
      } else {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
      }
    });
  };

  const isDraft = !invoice || invoice.status === "DRAFT";

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit(isDraft ? "draft" : "save");
      }}
      className="grid gap-5 lg:grid-cols-[1fr_300px]"
    >
      {invoice && <input type="hidden" name="id" value={invoice.id} />}
      <div className="flex min-w-0 flex-col gap-5">
        {invoice?.status === "SENT" && (
          <div className="rounded-lg border border-warning/30 bg-warning-bg px-3 py-2 text-[13px] text-warning">
            This invoice has already been issued. Changes will alter a document your client may already have — consider issuing a credit note or a new invoice instead.
          </div>
        )}
        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Client" error={errors.clientId} htmlFor="clientId">
              <Select id="clientId" name="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)} aria-invalid={Boolean(errors.clientId)}>
                <option value="">Choose a client…</option>
                {clients.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Invoice number" error={errors.number} hint={invoice ? undefined : `Leave blank to use ${defaults.nextNumber}`} htmlFor="number">
              <Input id="number" name="number" defaultValue={invoice?.number ?? ""} placeholder={defaults.nextNumber} className="tabular" />
            </Field>
            <Field label="Issue date" error={errors.issueDate} htmlFor="issueDate">
              <Input
                id="issueDate"
                type="date"
                name="issueDate"
                value={issueDate}
                onChange={(e) => {
                  setIssueDate(e.target.value);
                  if (!dueTouched && e.target.value) setDueDate(addDaysPlain(e.target.value, terms));
                }}
              />
            </Field>
            <Field label="Due date" error={errors.dueDate} hint={dueTouched ? undefined : `${terms}-day terms`} htmlFor="dueDate">
              <Input
                id="dueDate"
                type="date"
                name="dueDate"
                value={dueDate}
                onChange={(e) => {
                  setDueTouched(true);
                  setDueDate(e.target.value);
                }}
              />
            </Field>
            <Field label="Description" className="sm:col-span-2" htmlFor="description">
              <Input id="description" name="description" defaultValue={invoice?.description ?? ""} placeholder="e.g. Social content — November 2026" />
            </Field>
            {ctx && (ctx.projects.length > 0 || ctx.periods.length > 0) && (
              <>
                <Field label="Project" htmlFor="projectId">
                  <Select id="projectId" name="projectId" defaultValue={invoice?.projectId ?? ""}>
                    <option value="">None</option>
                    {ctx.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Package period" hint="Links this invoice to a package (counts as recurring revenue for retainers)" htmlFor="packagePeriodId">
                  <Select id="packagePeriodId" name="packagePeriodId" defaultValue={invoice?.packagePeriodId ?? ""}>
                    <option value="">None</option>
                    {ctx.periods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h3 className="text-[13px] font-semibold tracking-tight">Line items</h3>
            {ctx?.periods[0] && ctx.periods[0].priceCents > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setLines((ls) => [
                    ...ls.filter((l) => l.description || l.unit),
                    { key: key(), description: ctx.periods[0]!.packageName, qty: "1", unit: (ctx.periods[0]!.priceCents / 100).toFixed(2), vatRateBp: defaultRate },
                  ])
                }
              >
                <Plus /> Add package price
              </Button>
            )}
          </div>
          <div className="hidden grid-cols-[16px_1fr_72px_110px_150px_100px_28px] gap-2 border-y border-border bg-surface-2/50 px-4 py-2 text-xs font-medium text-muted md:grid">
            <span />
            <span>Description</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Unit price</span>
            <span>VAT</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          <ul className="divide-y divide-border">
            {lines.map((l, i) => {
              const p = parsed[i]!;
              const net = Math.round((p.qtyHundredths * p.unitCents) / 100);
              return (
                <li key={l.key} className="grid grid-cols-2 gap-2 px-4 py-3 md:grid-cols-[16px_1fr_72px_110px_150px_100px_28px] md:items-center md:py-2">
                  <GripVertical className="hidden size-4 text-subtle md:block" aria-hidden />
                  <Input
                    aria-label={`Line ${i + 1} description`}
                    className="col-span-2 md:col-span-1"
                    value={l.description}
                    placeholder="Description"
                    onChange={(e) => update(i, { description: e.target.value })}
                  />
                  <Input aria-label="Quantity" inputMode="decimal" className="tabular text-right" value={l.qty} onChange={(e) => update(i, { qty: e.target.value })} />
                  <Input aria-label="Unit price" inputMode="decimal" className="tabular text-right" placeholder="0.00" value={l.unit} onChange={(e) => update(i, { unit: e.target.value })} />
                  <Select aria-label="VAT rate" value={String(l.vatRateBp)} onChange={(e) => update(i, { vatRateBp: Number(e.target.value) })}>
                    {[...new Map(vatRates.map((r) => [r.rateBp, r])).values()].map((r) => (
                      <option key={r.id} value={r.rateBp}>
                        {formatRateBp(r.rateBp)}
                      </option>
                    ))}
                  </Select>
                  <div className="tabular flex items-center justify-end text-[13px] font-medium">{formatMoney(net)}</div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove line"
                    disabled={lines.length === 1}
                    onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                    className="justify-self-end"
                  >
                    <Trash2 />
                  </Button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-border px-4 py-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, { key: key(), description: "", qty: "1", unit: "", vatRateBp: ls.at(-1)?.vatRateBp ?? defaultRate }])}>
              <Plus /> Add line
            </Button>
          </div>
        </Card>

        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="VAT note (printed on invoice)" hint="e.g. “Exempt under Article 11 of the VAT Act” or “Reverse charge”" htmlFor="vatNote">
              <Textarea id="vatNote" name="vatNote" rows={3} defaultValue={invoice?.vatNote ?? ""} />
            </Field>
            <Field label="Internal notes (never shown to clients)" htmlFor="notes">
              <Textarea id="notes" name="notes" rows={3} defaultValue={invoice?.notes ?? ""} />
            </Field>
          </div>
          {vatRates.some((r) => r.note) && (
            <ul className="mt-3 flex flex-col gap-0.5 text-[11px] text-subtle">
              {vatRates
                .filter((r) => r.note)
                .map((r) => (
                  <li key={r.id}>
                    <span className="font-medium">{r.name}</span> — {r.note}
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>

      <aside className="lg:sticky lg:top-16 lg:self-start">
        <Card className="p-4">
          <h3 className="mb-3 text-[13px] font-semibold tracking-tight">Summary</h3>
          <dl className="flex flex-col gap-2 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd className="tabular">{formatMoney(totals.subtotalCents)}</dd>
            </div>
            {totals.byRate.map((r) => (
              <div key={r.rateBp} className="flex justify-between">
                <dt className="text-muted">
                  VAT {formatRateBp(r.rateBp)} <span className="text-subtle">on {formatMoney(r.netCents)}</span>
                </dt>
                <dd className="tabular">{formatMoney(r.vatCents)}</dd>
              </div>
            ))}
            <div className="mt-1 flex justify-between border-t border-border pt-3 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular">{formatMoney(totals.totalCents)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] text-subtle">VAT is calculated per line and rounded to the cent. {lines.length > 1 && totals.byRate.length > 1 ? "Multiple rates applied." : rateName(lines[0]?.vatRateBp ?? 0)}</p>
          <div className={cn("mt-4 flex flex-col gap-2")}>
            {isDraft ? (
              <>
                <Button type="button" variant="primary" size="lg" loading={pending} onClick={() => submit("send")}>
                  Save & mark as sent
                </Button>
                <Button type="button" size="lg" loading={pending} onClick={() => submit("draft")}>
                  Save as draft
                </Button>
              </>
            ) : (
              <Button type="button" variant="primary" size="lg" loading={pending} onClick={() => submit("save")}>
                Save changes
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </Card>
      </aside>
    </form>
  );
}
