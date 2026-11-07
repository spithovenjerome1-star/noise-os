import { Link2 } from "lucide-react";
import { db } from "@/lib/db";
import { fmtDate, fmtMoment, timeAgo } from "@/lib/dates";
import { linkIsActive } from "@/lib/permissions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, SectionTitle } from "@/components/ui/misc";
import { AttachmentList, UploadButton } from "@/components/attachments";
import { CreatePortalLink, NoteComposer, NoteItem, RevokePortalLink } from "@/components/clients/workspace-ui";

export async function FilesTab({ clientId, canEdit }: { clientId: string; canEdit: boolean }) {
  // Finance attachments (receipts, invoice PDFs) live on their invoices/expenses, not here.
  const files = await db.attachment.findMany({ where: { clientId, invoiceId: null, expenseId: null }, orderBy: { createdAt: "desc" } });
  const groups = [
    { title: "Contracts & agreements", kinds: ["CONTRACT"] },
    { title: "Brand assets", kinds: ["BRAND"] },
    { title: "Deliverables", kinds: ["DELIVERABLE"] },
    { title: "Other files", kinds: ["OTHER", "RECEIPT", "INVOICE_PDF"] },
  ] as const;
  return (
    <div className="flex flex-col gap-5">
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <UploadButton target={{ clientId }} kind="CONTRACT" label="Upload contract" />
          <UploadButton target={{ clientId }} kind="BRAND" label="Upload brand asset" />
          <UploadButton target={{ clientId }} kind="DELIVERABLE" label="Upload deliverable" />
          <UploadButton target={{ clientId }} kind="OTHER" label="Other file" variant="ghost" />
        </div>
      )}
      <p className="text-xs text-muted">Files are private. Use the eye icon to make a file (e.g. a deliverable) visible in the client portal.</p>
      {groups.map((g) => {
        const items = files.filter((f) => (g.kinds as readonly string[]).includes(f.kind));
        if (!items.length && g.title === "Other files") return null;
        return (
          <section key={g.title}>
            <SectionTitle>{g.title}</SectionTitle>
            <AttachmentList items={items} canEdit={canEdit} showVisibility />
          </section>
        );
      })}
    </div>
  );
}

export async function NotesTab({ clientId, canEdit }: { clientId: string; canEdit: boolean }) {
  const notes = await db.clientNote.findMany({ where: { clientId }, orderBy: [{ pinned: "desc" }, { createdAt: "desc" }], include: { author: { select: { name: true } } } });
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      {canEdit && (
        <Card>
          <CardBody className="pt-4">
            <NoteComposer clientId={clientId} />
          </CardBody>
        </Card>
      )}
      {notes.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted">No notes yet. Notes are internal and never shown to the client.</p>
      ) : (
        notes.map((n) => (
          <NoteItem
            key={n.id}
            clientId={clientId}
            note={{ id: n.id, body: n.body, pinned: n.pinned, author: n.author?.name ?? null, createdAt: fmtMoment(n.createdAt, "d MMM yyyy, HH:mm"), updatedAt: n.updatedAt.toISOString() }}
          />
        ))
      )}
    </div>
  );
}

export async function PortalTab({ clientId }: { clientId: string }) {
  const links = await db.shareLink.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, include: { script: { select: { title: true } } } });
  const portal = links.filter((l) => l.scope === "CLIENT_PORTAL");
  const scriptLinks = links.filter((l) => l.scope === "SCRIPT");
  const now = new Date();
  const status = (l: (typeof links)[number]) =>
    l.revokedAt ? <Badge>Revoked</Badge> : !linkIsActive(l, now) ? <Badge tone="warning">Expired</Badge> : <Badge tone="success" dot>Active</Badge>;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader title="Client portal" description="A simple page where the client sees their package progress, each video's status, scripts to approve, deliverables and invoice payment status." />
        <CardBody>
          <CreatePortalLink clientId={clientId} />
          <ul className="mt-3 flex flex-col gap-1 text-xs text-muted">
            <li>• Clients only ever see their own content.</li>
            <li>• Internal notes, costs, margins, comments marked internal and expenses are never shown.</li>
            <li>• Links can expire and can be revoked instantly.</li>
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Portal links" />
        {portal.length === 0 ? (
          <CardBody>
            <EmptyState icon={Link2} title="No portal links yet" description="Create a link and send it to your client on WhatsApp or email." className="py-8" />
          </CardBody>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {portal.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13px] font-medium">
                    {l.label ?? "Portal link"} {status(l)}
                  </div>
                  <div className="text-xs text-muted">
                    Created {fmtDate(l.createdAt)} · {l.expiresAt ? `${l.expiresAt < now ? "expired" : "expires"} ${fmtDate(l.expiresAt)}` : "no expiry"} ·{" "}
                    {l.lastUsedAt ? `last opened ${timeAgo(l.lastUsedAt)} (${l.useCount}×)` : "never opened"}
                  </div>
                </div>
                {!l.revokedAt && linkIsActive(l, now) && <RevokePortalLink id={l.id} />}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {scriptLinks.length > 0 && (
        <Card>
          <CardHeader title="Single-script links" description="Created from individual scripts" />
          <ul className="divide-y divide-border border-t border-border">
            {scriptLinks.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13px] font-medium">
                    {l.script?.title ?? "Script"} {status(l)}
                  </div>
                  <div className="text-xs text-muted">{l.lastUsedAt ? `Last opened ${timeAgo(l.lastUsedAt)}` : "Never opened"}</div>
                </div>
                {!l.revokedAt && linkIsActive(l, now) && <RevokePortalLink id={l.id} />}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
