"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Globe, Plus } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormDialog } from "@/components/form";
import { SelectField, TextField } from "@/components/fields";
import { CopyButton } from "@/components/copy-button";
import { createClientPortalLink, revokeClientPortalLink } from "@/server/portal/links";
import { fmtDate, timeAgo } from "@/lib/dates";
import { whatsappLink } from "@/lib/utils";

type Row = { id: string; label: string | null; createdAt: string; expiresAt: string | null; revokedAt: string | null; lastUsedAt: string | null; useCount: number; active: boolean };

export function PortalLinksPanel({ clientId, links, canEdit, whatsapp }: { clientId: string; links: Row[]; canEdit: boolean; whatsapp?: string | null }) {
  const [open, setOpen] = React.useState(false);
  const [created, setCreated] = React.useState<string | null>(null);
  const router = useRouter();
  const active = links.filter((l) => l.active);
  const inactive = links.filter((l) => !l.active);
  return (
    <Card>
      <CardHeader
        title="Client portal"
        description="A private page where the client sees video progress, reviews work, approves scripts and checks invoice status."
        action={canEdit ? <Button size="sm" onClick={() => setOpen(true)}><Plus /> New link</Button> : null}
      />
      <div className="flex flex-col gap-2 px-4 pb-4">
        {created && (
          <div className="rounded-lg border border-success/30 bg-success-bg p-2.5">
            <p className="mb-1.5 text-xs font-medium text-success">Portal link created — copy it now, it won’t be shown again.</p>
            <div className="flex gap-1.5">
              <Input readOnly value={created} onFocus={(e) => e.currentTarget.select()} className="h-7 text-xs" />
              <CopyButton text={created} label="" size="icon-sm" aria-label="Copy link" />
              {whatsappLink(whatsapp, created) && (
                <Button asChild size="sm"><a href={whatsappLink(whatsapp, `Here's your NOISE portal: ${created}`)!} target="_blank" rel="noreferrer">WhatsApp</a></Button>
              )}
            </div>
          </div>
        )}
        {!links.length && !created && <p className="flex items-center gap-2 text-[13px] text-muted"><Globe className="size-4" /> No portal link yet.</p>}
        {[...active, ...inactive.slice(0, 3)].map((l) => (
          <div key={l.id} className="flex items-center gap-2 text-[13px]">
            <div className="min-w-0 flex-1">
              <div className="truncate">{l.label || "Portal link"}</div>
              <div className="text-[11px] text-subtle">
                {l.revokedAt ? "Revoked" : !l.active ? "Expired" : l.expiresAt ? `Expires ${fmtDate(new Date(l.expiresAt))}` : "No expiry"}
                {l.lastUsedAt ? ` · last opened ${timeAgo(new Date(l.lastUsedAt))} (${l.useCount}×)` : " · not opened yet"}
              </div>
            </div>
            {l.active ? (
              canEdit && (
                <Button
                  size="sm"
                  variant="danger-ghost"
                  onClick={async () => {
                    if (!confirm("Revoke this portal link? The client loses access immediately.")) return;
                    const r = await revokeClientPortalLink(l.id);
                    if (r.ok) {
                      toast.success(r.message ?? "Revoked");
                      router.refresh();
                    } else toast.error(r.error);
                  }}
                >
                  <Ban /> Revoke
                </Button>
              )
            ) : (
              <Badge>{l.revokedAt ? "Revoked" : "Expired"}</Badge>
            )}
          </div>
        ))}
      </div>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="New portal link"
        description="Anyone with the link can view this client’s portal. Internal notes, costs and margins are never shown."
        action={(fd) => createClientPortalLink(clientId, fd)}
        submitLabel="Create link"
        successMessage="Portal link created"
        onSuccess={(d) => d && setCreated(d.url)}
      >
        <TextField name="label" label="Label (optional)" placeholder="e.g. Maria — marketing manager" />
        <SelectField
          name="expiresInDays"
          label="Expires"
          defaultValue="180"
          options={[
            { value: "30", label: "In 30 days" },
            { value: "90", label: "In 90 days" },
            { value: "180", label: "In 6 months" },
            { value: "365", label: "In 1 year" },
            { value: "", label: "Never (revoke manually)" },
          ]}
        />
      </FormDialog>
    </Card>
  );
}
