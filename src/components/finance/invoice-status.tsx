import { Badge } from "@/components/ui/badge";
import { INVOICE_STATUS } from "@/lib/labels";
import type { PaymentState } from "@/lib/domain/invoices";

/** Payment status badge, with overdue shown separately from partial payment. */
export function InvoiceStatusBadge({ state }: { state: PaymentState }) {
  if (state.status === "OVERDUE") {
    return (
      <span className="inline-flex items-center gap-1">
        {state.paidCents > 0 && <Badge tone="violet">Partially paid</Badge>}
        <Badge tone="danger" dot>
          {state.daysOverdue}d overdue
        </Badge>
      </span>
    );
  }
  const s = INVOICE_STATUS[state.status];
  return (
    <Badge tone={s.tone} dot={state.status !== "DRAFT" && state.status !== "CANCELLED"}>
      {s.label}
    </Badge>
  );
}
