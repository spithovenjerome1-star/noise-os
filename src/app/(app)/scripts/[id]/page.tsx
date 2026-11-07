import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { contentOf } from "@/lib/domain/scripts";
import { linkIsActive } from "@/lib/permissions";
import { ScriptEditor } from "./script-editor";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await db.script.findUnique({ where: { id }, select: { title: true } });
  return { title: s?.title ?? "Script" };
}

export default async function ScriptPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const script = await db.script.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      video: { select: { id: true, title: true } },
      approvedVersion: { select: { id: true, version: true, revision: true } },
      versions: {
        orderBy: { version: "desc" },
        include: {
          createdBy: { select: { name: true } },
          approvals: { orderBy: { createdAt: "desc" }, select: { id: true, decision: true, byName: true, note: true, createdAt: true, shareLinkId: true } },
        },
      },
      comments: { orderBy: { createdAt: "asc" }, include: { version: { select: { version: true } } } },
      shareLinks: { where: { scope: "SCRIPT" }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!script) notFound();

  const [videos, portalLinks] = await Promise.all([
    db.video.findMany({
      where: { clientId: script.clientId, OR: [{ script: null }, { id: script.videoId ?? "" }] },
      select: { id: true, title: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    db.shareLink.count({ where: { clientId: script.clientId, scope: "CLIENT_PORTAL", revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }),
  ]);

  const now = new Date();
  return (
    <ScriptEditor
      script={{
        id: script.id,
        title: script.title,
        status: script.status,
        revision: script.revision,
        client: script.client,
        video: script.video,
        content: contentOf(script as unknown as Record<string, unknown>),
        approvedVersion: script.approvedVersion,
        updatedAt: script.updatedAt.toISOString(),
      }}
      versions={script.versions.map((v) => ({
        id: v.id,
        version: v.version,
        revision: v.revision,
        label: v.label,
        sentToClient: v.sentToClient,
        createdAt: v.createdAt.toISOString(),
        createdBy: v.createdBy?.name ?? null,
        content: contentOf(v.content as Record<string, unknown>),
        approvals: v.approvals.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
      }))}
      comments={script.comments.map((c) => ({
        id: c.id,
        parentId: c.parentId,
        authorName: c.authorName,
        body: c.body,
        source: c.source,
        resolved: c.resolved,
        createdAt: c.createdAt.toISOString(),
        version: c.version?.version ?? null,
      }))}
      shareLinks={script.shareLinks.map((l) => ({
        id: l.id,
        label: l.label,
        createdAt: l.createdAt.toISOString(),
        expiresAt: l.expiresAt?.toISOString() ?? null,
        revokedAt: l.revokedAt?.toISOString() ?? null,
        lastUsedAt: l.lastUsedAt?.toISOString() ?? null,
        useCount: l.useCount,
        active: linkIsActive(l, now),
      }))}
      videos={videos}
      hasPortal={portalLinks > 0}
    />
  );
}
