import { db } from "@/lib/db";
import { linkIsActive } from "@/lib/permissions";
import { PortalLinksPanel } from "./portal-links-panel";

/** Drop-in server component for the client workspace: manage this client's portal links. */
export async function ClientPortalLinks({ clientId, canEdit = true }: { clientId: string; canEdit?: boolean }) {
  const [links, client] = await Promise.all([
    db.shareLink.findMany({ where: { clientId, scope: "CLIENT_PORTAL" }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.client.findUnique({ where: { id: clientId }, select: { whatsapp: true, phone: true } }),
  ]);
  const now = new Date();
  return (
    <PortalLinksPanel
      clientId={clientId}
      canEdit={canEdit}
      whatsapp={client?.whatsapp ?? client?.phone ?? null}
      links={links.map((l) => ({
        id: l.id,
        label: l.label,
        createdAt: l.createdAt.toISOString(),
        expiresAt: l.expiresAt?.toISOString() ?? null,
        revokedAt: l.revokedAt?.toISOString() ?? null,
        lastUsedAt: l.lastUsedAt?.toISOString() ?? null,
        useCount: l.useCount,
        active: linkIsActive(l, now),
      }))}
    />
  );
}
