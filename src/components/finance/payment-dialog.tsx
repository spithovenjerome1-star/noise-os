"use client";
import * as React from "react";
import { FormDialog } from "@/components/form";
import { MoneyField, Row, SelectField, TextField, TextAreaField } from "@/components/fields";
import { savePayment } from "@/server/finance/invoice-actions";
import { PAYMENT_METHOD, options } from "@/lib/labels";
import { centsToInput } from "@/lib/money";

export type PaymentRow = { id: string; amountCents: number; paidOn: string; method: string; reference: string | null; notes: string | null };

export function PaymentDialog({
  invoiceId,
  balanceCents,
  payment,
  trigger,
  today,
}: {
  invoiceId: string;
  balanceCents: number;
  payment?: PaymentRow;
  trigger: React.ReactNode;
  today: string;
}) {
  return (
    <FormDialog
      trigger={trigger}
      title={payment ? "Edit payment" : "Record payment"}
      description={payment ? undefined : "Record money actually received. Partial payments are fine."}
      action={savePayment}
      submitLabel={payment ? "Save payment" : "Record payment"}
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />
      {payment && <input type="hidden" name="id" value={payment.id} />}
      <Row>
        <MoneyField name="amount" label="Amount received" defaultValue={centsToInput(payment?.amountCents ?? balanceCents)} autoFocus />
        <TextField name="paidOn" type="date" label="Date received" defaultValue={payment?.paidOn ?? today} />
      </Row>
      <Row>
        <SelectField name="method" label="Method" options={options(PAYMENT_METHOD)} defaultValue={payment?.method ?? "BANK_TRANSFER"} />
        <TextField name="reference" label="Reference" placeholder="Bank ref, receipt no." defaultValue={payment?.reference ?? ""} />
      </Row>
      <TextAreaField name="notes" label="Notes" rows={2} defaultValue={payment?.notes ?? ""} />
    </FormDialog>
  );
}
