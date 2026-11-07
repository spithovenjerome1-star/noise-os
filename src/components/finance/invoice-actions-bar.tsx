"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, MoreHorizontal, Pencil, Printer, Send, Undo2, XCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { ActionButton } from "@/components/form";
import { cancelInvoice, deleteInvoice, duplicateInvoice, markInvoiceSent, revertInvoiceToDraft } from "@/server/finance/invoice-actions";

export function InvoiceActionsBar({ id, status, hasPayments, canEdit }: { id: string; status: "DRAFT" | "SENT" | "CANCELLED"; hasPayments: boolean; canEdit: boolean }) {
  const router = useRouter();
  const run = async (fn: () => Promise<{ ok: boolean; error?: string; message?: string; data?: unknown }>, confirmText?: string, after?: (d: unknown) => void) => {
    if (confirmText && !confirm(confirmText)) return;
    const r = await fn();
    if (r.ok) {
      toast.success(r.message ?? "Done");
      if (after) after(r.data);
      else router.refresh();
    } else toast.error(r.error);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild>
        <Link href={`/print/invoices/${id}`} target="_blank">
          <Printer /> Print / PDF
        </Link>
      </Button>
      {canEdit && status === "DRAFT" && (
        <ActionButton variant="primary" action={() => markInvoiceSent(id)}>
          <Send /> Mark as sent
        </ActionButton>
      )}
      {canEdit && status !== "CANCELLED" && (
        <Button asChild>
          <Link href={`/invoices/${id}/edit`}>
            <Pencil /> Edit
          </Link>
        </Button>
      )}
      {canEdit && (
        <Dropdown>
          <DropdownTrigger asChild>
            <Button size="icon" aria-label="More actions">
              <MoreHorizontal />
            </Button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem onSelect={() => run(() => duplicateInvoice(id), undefined, (d) => router.push(`/invoices/${(d as { id: string }).id}`))}>
              <Copy /> Duplicate as new draft
            </DropdownItem>
            {status === "SENT" && (
              <DropdownItem disabled={hasPayments} onSelect={() => run(() => revertInvoiceToDraft(id))}>
                <Undo2 /> Revert to draft{hasPayments ? " (has payments)" : ""}
              </DropdownItem>
            )}
            {status === "CANCELLED" && (
              <DropdownItem disabled={hasPayments} onSelect={() => run(() => revertInvoiceToDraft(id), "Restore this invoice as a draft?")}>
                <Undo2 /> Restore as draft
              </DropdownItem>
            )}
            {status !== "CANCELLED" && (
              <>
                <DropdownSeparator />
                <DropdownItem danger onSelect={() => run(() => cancelInvoice(id), "Cancel this invoice? It stays on record but no longer counts as revenue or money owed.")}>
                  <XCircle /> Cancel invoice
                </DropdownItem>
              </>
            )}
            {status === "DRAFT" && !hasPayments && (
              <DropdownItem danger onSelect={() => run(() => deleteInvoice(id), "Delete this draft permanently?", () => router.push("/invoices"))}>
                <Trash2 /> Delete draft
              </DropdownItem>
            )}
          </DropdownContent>
        </Dropdown>
      )}
    </div>
  );
}
