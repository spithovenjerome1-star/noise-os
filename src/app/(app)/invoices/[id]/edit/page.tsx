import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { invoiceEditorData } from "@/server/finance/editor-data";
import { InvoiceEditor } from "@/components/finance/invoice-editor";
import { PageHeader } from "@/components/ui/misc";
import { plainOf } from "@/lib/dates";

export const metadata = { title: "Edit invoice" };

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("finance:edit");
  const { id } = await params;
  const inv = await db.invoice.findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" } } } });
  if (!inv) notFound();
  if (inv.status === "CANCELLED") redirect(`/invoices/${id}`);
  const data = await invoiceEditorData();
  // Keep the invoice's client selectable even if archived.
  if (!data.clients.some((c) => c.value === inv.clientId)) {
    const c = await db.client.findUnique({ where: { id: inv.clientId }, select: { id: true, name: true } });
    if (c) data.clients.unshift({ value: c.id, label: c.name });
  }
  return (
    <>
      <Link href={`/invoices/${id}`} className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        <ChevronLeft className="size-3.5" /> {inv.number}
      </Link>
      <PageHeader title={`Edit ${inv.number}`} />
      <InvoiceEditor
        {...data}
        invoice={{
          id: inv.id,
          number: inv.number,
          status: inv.status,
          clientId: inv.clientId,
          projectId: inv.projectId,
          packagePeriodId: inv.packagePeriodId,
          description: inv.description,
          issueDate: plainOf(inv.issueDate)!,
          dueDate: plainOf(inv.dueDate)!,
          vatNote: inv.vatNote,
          notes: inv.notes,
          lines: inv.lines.map((l) => ({ description: l.description, qty: String(l.qtyHundredths / 100), unit: (l.unitCents / 100).toFixed(2), vatRateBp: l.vatRateBp })),
        }}
      />
    </>
  );
}
