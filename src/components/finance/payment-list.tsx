"use client";
import { Pencil, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/form";
import { PaymentDialog, type PaymentRow } from "./payment-dialog";
import { deletePayment } from "@/server/finance/invoice-actions";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/dates";
import { PAYMENT_METHOD } from "@/lib/labels";

export function PaymentList({ invoiceId, payments, balanceCents, canEdit, cancelled, today }: { invoiceId: string; payments: PaymentRow[]; balanceCents: number; canEdit: boolean; cancelled: boolean; today: string }) {
  return (
    <div>
      {payments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-[13px] text-muted">No payments recorded.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2.5 text-[13px]">
              <div className="min-w-0 flex-1">
                <div className="tabular font-medium">{formatMoney(p.amountCents)}</div>
                <div className="truncate text-xs text-muted">
                  {fmtDate(p.paidOn)} · {PAYMENT_METHOD[p.method as keyof typeof PAYMENT_METHOD]}
                  {p.reference ? ` · ${p.reference}` : ""}
                </div>
              </div>
              {canEdit && (
                <>
                  <PaymentDialog invoiceId={invoiceId} balanceCents={balanceCents} payment={p} today={today} trigger={<Button variant="ghost" size="icon-sm" aria-label="Edit payment"><Pencil /></Button>} />
                  <ActionButton variant="ghost" size="icon-sm" aria-label="Delete payment" confirm={`Remove the payment of ${formatMoney(p.amountCents)}?`} action={() => deletePayment(p.id)}>
                    <Trash2 />
                  </ActionButton>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && !cancelled && (
        <PaymentDialog
          invoiceId={invoiceId}
          balanceCents={balanceCents}
          today={today}
          trigger={
            <Button variant={balanceCents > 0 ? "primary" : "secondary"} size="sm" className="mt-3">
              <Plus /> Record payment
            </Button>
          }
        />
      )}
    </div>
  );
}
