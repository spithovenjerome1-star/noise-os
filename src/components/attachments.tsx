"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Image as ImageIcon, Paperclip, Trash2, Upload, Eye, EyeOff, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { uploadAttachments, deleteAttachment, toggleAttachmentVisibility } from "@/server/files";
import { ATTACHMENT_KIND } from "@/lib/labels";
import type { AttachmentKind } from "@prisma/client";

export type AttachmentRow = { id: string; fileName: string; mimeType: string; sizeBytes: number; kind: AttachmentKind; visibleToClient: boolean; createdAt: string | Date };

function size(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function UploadButton({
  target,
  kind = "OTHER",
  label = "Upload",
  accept,
  allowClientVisibility,
  variant = "secondary",
}: {
  target: { clientId?: string; invoiceId?: string; expenseId?: string; videoId?: string };
  kind?: AttachmentKind;
  label?: string;
  accept?: string;
  allowClientVisibility?: boolean;
  variant?: "secondary" | "ghost" | "primary";
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  const [pending, start] = React.useTransition();
  const router = useRouter();
  return (
    <>
      <input
        ref={ref}
        type="file"
        multiple
        hidden
        accept={accept}
        onChange={(e) => {
          const files = e.target.files;
          if (!files?.length) return;
          const fd = new FormData();
          Object.entries(target).forEach(([k, v]) => v && fd.set(k, v));
          fd.set("kind", kind);
          if (allowClientVisibility === true) fd.set("visibleToClient", "false");
          Array.from(files).forEach((f) => fd.append("files", f));
          start(async () => {
            const r = await uploadAttachments(fd);
            if (r.ok) {
              toast.success(r.message ?? "Uploaded");
              router.refresh();
            } else toast.error(r.error);
            if (ref.current) ref.current.value = "";
          });
        }}
      />
      <Button type="button" variant={variant} size="sm" loading={pending} onClick={() => ref.current?.click()}>
        <Upload /> {label}
      </Button>
    </>
  );
}

export function AttachmentList({ items, canEdit = true, showVisibility }: { items: AttachmentRow[]; canEdit?: boolean; showVisibility?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  if (!items.length)
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-4 text-[13px] text-muted">
        <Paperclip className="size-4" /> No files yet
      </div>
    );
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {items.map((a) => {
        const Icon = a.mimeType.startsWith("image/") ? ImageIcon : FileText;
        return (
          <li key={a.id} className="flex items-center gap-3 px-3 py-2">
            <Icon className="size-4 shrink-0 text-subtle" />
            <a href={`/api/files/${a.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[13px] hover:underline">
              {a.fileName}
            </a>
            <Badge>{ATTACHMENT_KIND[a.kind]}</Badge>
            {showVisibility && a.visibleToClient && <Badge tone="info">Client can see</Badge>}
            <span className="hidden text-xs text-subtle sm:inline">{size(a.sizeBytes)}</span>
            <Button variant="ghost" size="icon-sm" asChild aria-label="Download">
              <a href={`/api/files/${a.id}?download=1`}><Download /></a>
            </Button>
            {canEdit && showVisibility && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={a.visibleToClient ? "Hide from client portal" : "Show in client portal"}
                title={a.visibleToClient ? "Hide from client portal" : "Show in client portal"}
                loading={busy === a.id + "v"}
                onClick={async () => {
                  setBusy(a.id + "v");
                  const r = await toggleAttachmentVisibility(a.id, !a.visibleToClient);
                  setBusy(null);
                  if (r.ok) router.refresh();
                  else toast.error(r.error);
                }}
              >
                {a.visibleToClient ? <Eye /> : <EyeOff />}
              </Button>
            )}
            {canEdit && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Delete file"
                loading={busy === a.id}
                onClick={async () => {
                  if (!confirm(`Delete ${a.fileName}? This can't be undone.`)) return;
                  setBusy(a.id);
                  const r = await deleteAttachment(a.id);
                  setBusy(null);
                  if (r.ok) {
                    toast.success("File deleted");
                    router.refresh();
                  } else toast.error(r.error);
                }}
              >
                <Trash2 />
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
