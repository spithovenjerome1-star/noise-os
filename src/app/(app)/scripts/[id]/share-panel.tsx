"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Link2, Plus, Ban } from "lucide-react";
import type { ScriptStatus } from "@prisma/client";
import { toast } from "sonner";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormDialog } from "@/components/form";
import { SelectField, TextField } from "@/components/fields";
import { CopyButton } from "@/components/copy-button";
import { createScriptShare, revokeShare } from "@/server/scripts/actions";
import { timeAgo, fmtDate } from "@/lib/dates";

export type ShareRow = { id: string; label: string | null; createdAt: string; expiresAt: string | null; revokedAt: string | null; lastUsedAt: string | null; useCount: number; active: boolean };

export function SharePanel({ scriptId, links, hasPortal, status }: { scriptId: string; links: ShareRow[]; hasPortal: boolean; status: ScriptStatus }) {
  const [open, setOpen] = React.useState(false);
  const [created, setCreated] = React.useState<string | null>(null);
  const router = useRouter();
  const notSent = status === "DRAFT" || status === "INTERNAL_REVIEW";
  return (
    <Card>
      <CardHeader
        title="Client sharing"
        description={hasPortal ? "This client also sees sent scripts in their portal." : "Share this one script with a private link."}
        action={<Button size="sm" onClick={() => setOpen(true)}><Plus /> Link</Button>}
      />
      <div className="flex flex-col gap-2 px-4 pb-4">
        {notSent && <p className="rounded-md bg-surface-2 px-2.5 py-1.5 text-xs text-muted">Clients only see versions you’ve sent. Use “Send to client” first.</p>}
        {created && (
          <div className="rounded-lg border border-success/30 bg-success-bg p-2.5">
            <p className="mb-1.5 text-xs font-medium text-success">Link created — copy it now, it won’t be shown again.</p>
            <div className="flex gap-1.5">
              <Input readOnly value={created} onFocus={(e) => e.currentTarget.select()} className="h-7 text-xs" />
              <CopyButton text={created} label="" size="icon-sm" aria-label="Copy link" />
            </div>
          </div>
        )}
        {links.length === 0 && !created && <p className="flex items-center gap-2 text-[13px] text-muted"><Link2 className="size-4" /> No share links.</p>}
        {links.map((l) => (
          <div key={l.id} className="flex items-center gap-2 text-[13px]">
            <div className="min-w-0 flex-1">
              <div className="truncate">{l.label || "Share link"}</div>
              <div className="text-[11px] text-subtle">
                {l.revokedAt ? "Revoked" : !l.active ? "Expired" : l.expiresAt ? `Expires ${fmtDate(new Date(l.expiresAt))}` : "No expiry"}
                {l.lastUsedAt ? ` · opened ${timeAgo(new Date(l.lastUsedAt))}` : " · not opened yet"}
              </div>
            </div>
            {l.active ? (
              <Button
                size="sm"
                variant="danger-ghost"
                onClick={async () => {
                  if (!confirm("Revoke this link? Anyone holding it loses access immediately.")) return;
                  const r = await revokeShare(l.id);
                  if (r.ok) {
                    toast.success(r.message ?? "Revoked");
                    router.refresh();
                  } else toast.error(r.error);
                }}
              >
                <Ban /> Revoke
              </Button>
            ) : (
              <Badge>{l.revokedAt ? "Revoked" : "Expired"}</Badge>
            )}
          </div>
        ))}
      </div>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Create share link"
        description="The client can read the sent version, comment, approve or request changes. Nothing else."
        action={(fd) => createScriptShare(scriptId, fd)}
        submitLabel="Create link"
        successMessage="Link created"
        onSuccess={(d) => d && setCreated(d.url)}
      >
        <TextField name="label" label="Label (optional)" placeholder="e.g. Sent to Maria on WhatsApp" />
        <SelectField
          name="expiresInDays"
          label="Expires"
          defaultValue="30"
          options={[
            { value: "7", label: "In 7 days" },
            { value: "30", label: "In 30 days" },
            { value: "90", label: "In 90 days" },
            { value: "", label: "Never (revoke manually)" },
          ]}
        />
      </FormDialog>
    </Card>
  );
}
