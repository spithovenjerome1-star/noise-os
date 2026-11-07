import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/server/auth";
import { invoiceEditorData } from "@/server/finance/editor-data";
import { InvoiceEditor } from "@/components/finance/invoice-editor";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";

export const metadata = { title: "New invoice" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  await requireUser("finance:edit");
  const sp = await searchParams;
  const data = await invoiceEditorData();
  return (
    <>
      <Link href="/invoices" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        <ChevronLeft className="size-3.5" /> Invoices
      </Link>
      <PageHeader title="New invoice" description="Totals and VAT are recalculated on the server when you save." />
      {data.clients.length === 0 ? (
        <EmptyState
          title="Add a client first"
          description="Invoices belong to a client."
          action={
            <Button asChild variant="primary">
              <Link href="/clients?new=1">Add client</Link>
            </Button>
          }
        />
      ) : (
        <InvoiceEditor {...data} initialClientId={sp.client} />
      )}
    </>
  );
}
