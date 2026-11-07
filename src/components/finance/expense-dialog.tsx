"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FormDialog, useFieldError } from "@/components/form";
import { CheckboxField, MoneyField, Row, SelectField, TextAreaField, TextField } from "@/components/fields";
import { Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AttachmentList, UploadButton, type AttachmentRow } from "@/components/attachments";
import { saveExpense, deleteExpense, saveRecurringExpense, deleteRecurringExpense } from "@/server/finance/expense-actions";
import { EXPENSE_CATEGORY, INTERVAL, PAYMENT_METHOD, options } from "@/lib/labels";
import { centsToInput, formatMoney, formatRateBp, parseMoney, splitGross } from "@/lib/money";

type Opt = { value: string; label: string };
export type VatOpt = { rateBp: number; name: string };

export type ExpenseData = {
  id: string;
  description: string;
  amountCents: number;
  vatCents: number;
  vatRateBp: number | null;
  vatReclaimable: boolean;
  date: string;
  category: string;
  vendor: string | null;
  clientId: string | null;
  projectId: string | null;
  paymentMethod: string;
  businessUsePct: number;
  notes: string | null;
  recurringId: string | null;
  attachments: AttachmentRow[];
};

/** Gross amount + VAT selector with a live net/VAT preview. */
function VatInputs({ defaultAmount, defaultMode, defaultVat, vatRates }: { defaultAmount?: number; defaultMode: string; defaultVat?: number; vatRates: VatOpt[] }) {
  const [amount, setAmount] = React.useState(centsToInput(defaultAmount));
  const [mode, setMode] = React.useState(defaultMode);
  const amountError = useFieldError("amount");
  const gross = parseMoney(amount) ?? 0;
  const preview = mode === "manual" ? null : splitGross(gross, Number(mode.replace("rate:", "")));
  const rates = [...new Map(vatRates.map((r) => [r.rateBp, r])).values()];
  return (
    <>
      <Row>
        <Field label="Total paid (incl. VAT)" error={amountError} htmlFor="f-amount">
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-subtle">€</span>
            <Input id="f-amount" name="amount" inputMode="decimal" className="tabular pl-6" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={Boolean(amountError)} />
          </div>
        </Field>
        <Field label="VAT" htmlFor="f-vatMode">
          <Select id="f-vatMode" name="vatMode" value={mode} onChange={(e) => setMode(e.target.value)}>
            {rates.map((r) => (
              <option key={r.rateBp} value={`rate:${r.rateBp}`}>
                {r.rateBp === 0 ? "No VAT / exempt (0%)" : `${formatRateBp(r.rateBp)} included`}
              </option>
            ))}
            <option value="manual">Enter VAT amount from receipt</option>
          </Select>
        </Field>
      </Row>
      {mode === "manual" ? (
        <MoneyField name="vatAmount" label="VAT amount on receipt" defaultValue={centsToInput(defaultVat)} />
      ) : (
        gross > 0 &&
        preview && (
          <p className="-mt-2 text-xs text-muted">
            Net <span className="tabular">{formatMoney(preview.netCents)}</span> + VAT <span className="tabular">{formatMoney(preview.vatCents)}</span>
          </p>
        )
      )}
    </>
  );
}

export function ExpenseDialog({
  expense,
  clients,
  projects,
  vatRates,
  defaultVatBp,
  today,
  open,
  onOpenChange,
  trigger,
}: {
  expense?: ExpenseData;
  clients: Opt[];
  projects: Opt[];
  vatRates: VatOpt[];
  defaultVatBp: number;
  today: string;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const mode = expense ? (expense.vatRateBp === null ? "manual" : `rate:${expense.vatRateBp}`) : `rate:${defaultVatBp}`;
  return (
    <FormDialog
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={expense ? "Edit expense" : "Add expense"}
      description={expense?.recurringId ? "Generated from a recurring expense. Edits apply to this occurrence only." : undefined}
      action={saveExpense}
      submitLabel={expense ? "Save" : "Add expense"}
      wide
      onSuccess={(d) => {
        if (!expense && d) {
          // Re-open as edit so a receipt can be attached right away.
          router.replace(`/expenses?expense=${(d as { id: string }).id}`, { scroll: false });
        }
      }}
      danger={
        expense ? (
          <Button
            type="button"
            variant="danger-ghost"
            size="sm"
            onClick={async () => {
              if (!confirm("Delete this expense and its receipts?")) return;
              const r = await deleteExpense(expense.id);
              if (r.ok) {
                toast.success("Expense deleted");
                onOpenChange?.(false);
                router.refresh();
              } else toast.error(r.error);
            }}
          >
            <Trash2 /> Delete
          </Button>
        ) : undefined
      }
    >
      {expense && <input type="hidden" name="id" value={expense.id} />}
      <TextField name="description" label="Description" defaultValue={expense?.description} placeholder="e.g. Adobe Creative Cloud" autoFocus={!expense} />
      <VatInputs defaultAmount={expense?.amountCents} defaultMode={mode} defaultVat={expense?.vatCents} vatRates={vatRates} />
      <Row cols={3}>
        <TextField name="date" type="date" label="Date" defaultValue={expense?.date ?? today} />
        <SelectField name="category" label="Category" options={options(EXPENSE_CATEGORY)} defaultValue={expense?.category ?? "OTHER"} />
        <TextField name="vendor" label="Vendor" defaultValue={expense?.vendor ?? ""} />
      </Row>
      <Row cols={3}>
        <SelectField name="paymentMethod" label="Paid with" options={options(PAYMENT_METHOD)} defaultValue={expense?.paymentMethod ?? "CARD"} />
        <TextField name="businessUsePct" type="number" min={0} max={100} label="Business use %" defaultValue={expense?.businessUsePct ?? 100} hint="e.g. 60 for a car used partly privately" />
        <div className="flex items-end pb-1.5">
          <CheckboxField name="vatReclaimable" label="VAT reclaimable" defaultChecked={expense?.vatReclaimable ?? true} />
        </div>
      </Row>
      <Row>
        <SelectField name="clientId" label="Client (optional)" options={clients} placeholder="Not client-specific" defaultValue={expense?.clientId ?? ""} />
        <SelectField name="projectId" label="Project (optional)" options={projects} placeholder="None" defaultValue={expense?.projectId ?? ""} />
      </Row>
      <TextAreaField name="notes" label="Notes" rows={2} defaultValue={expense?.notes ?? ""} />
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted">Receipts</span>
          {expense && <UploadButton target={{ expenseId: expense.id }} kind="RECEIPT" label="Attach receipt" accept="application/pdf,image/*" />}
        </div>
        {expense ? <AttachmentList items={expense.attachments} /> : <p className="text-xs text-subtle">Save the expense first, then attach the receipt.</p>}
      </div>
    </FormDialog>
  );
}

export type RecurringData = {
  id: string;
  description: string;
  amountCents: number;
  vatCents: number;
  category: string;
  vendor: string | null;
  interval: string;
  nextDate: string;
  endDate: string | null;
  paymentMethod: string;
  businessUsePct: number;
  active: boolean;
};

export function RecurringDialog({ item, vatRates, today, trigger }: { item?: RecurringData; vatRates: VatOpt[]; today: string; trigger: React.ReactNode }) {
  const router = useRouter();
  return (
    <FormDialog
      trigger={trigger}
      title={item ? "Edit recurring expense" : "New recurring expense"}
      description="An expense is recorded automatically on each due date (including any missed ones)."
      action={saveRecurringExpense}
      wide
      danger={
        item ? (
          <Button
            type="button"
            variant="danger-ghost"
            size="sm"
            onClick={async () => {
              if (!confirm("Stop and remove this recurring expense? Already-recorded expenses are kept.")) return;
              const r = await deleteRecurringExpense(item.id);
              if (r.ok) {
                toast.success(r.message ?? "Removed");
                router.refresh();
              } else toast.error(r.error);
            }}
          >
            <Trash2 /> Remove
          </Button>
        ) : undefined
      }
    >
      {item && <input type="hidden" name="id" value={item.id} />}
      <TextField name="description" label="Description" defaultValue={item?.description} placeholder="e.g. Frame.io subscription" />
      <VatInputs defaultAmount={item?.amountCents} defaultMode={item ? "manual" : "rate:0"} defaultVat={item?.vatCents} vatRates={vatRates} />
      <Row cols={3}>
        <SelectField name="interval" label="Repeats" options={options(INTERVAL)} defaultValue={item?.interval ?? "MONTHLY"} />
        <TextField name="nextDate" type="date" label="Next date" defaultValue={item?.nextDate ?? today} />
        <TextField name="endDate" type="date" label="Ends (optional)" defaultValue={item?.endDate ?? ""} />
      </Row>
      <Row cols={3}>
        <SelectField name="category" label="Category" options={options(EXPENSE_CATEGORY)} defaultValue={item?.category ?? "SOFTWARE"} />
        <TextField name="vendor" label="Vendor" defaultValue={item?.vendor ?? ""} />
        <SelectField name="paymentMethod" label="Paid with" options={options(PAYMENT_METHOD)} defaultValue={item?.paymentMethod ?? "CARD"} />
      </Row>
      <Row>
        <TextField name="businessUsePct" type="number" min={0} max={100} label="Business use %" defaultValue={item?.businessUsePct ?? 100} />
        <div className="flex items-end pb-1.5">
          <CheckboxField name="active" label="Active" defaultChecked={item?.active ?? true} />
        </div>
      </Row>
    </FormDialog>
  );
}
