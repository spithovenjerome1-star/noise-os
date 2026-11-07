import "server-only";
import { db } from "@/lib/db";
import { computePeriodProgress } from "@/lib/domain/packages";
import { paymentState } from "@/lib/domain/invoices";
import { contentOf } from "@/lib/domain/scripts";
import { plainOf, todayMalta, addDaysPlain } from "@/lib/dates";
import { linkCanAccessClientResource, linkCanAccessScript, type LinkLike } from "@/lib/permissions";

/** Everything a client may see in their portal. Strictly no internal notes, costs or margins. */
export async function loadPortal(link: LinkLike) {
  if (link.scope !== "CLIENT_PORTAL" || !linkCanAccessClientResource(link, { clientId: link.clientId })) return null;
  const clientId = link.clientId;
  const today = todayMalta();

  const packages = await db.servicePackage.findMany({
    where: { clientId, active: true },
    orderBy: { startDate: "asc" },
    select: {
      id: true,
      name: true,
      type: true,
      videosIncluded: true,
      periods: { orderBy: { startDate: "desc" }, select: { id: true, startDate: true, endDate: true, videosIncluded: true, rolledOverIn: true } },
    },
  });
  const current = packages
    .map((p) => {
      const period = p.periods.find((x) => plainOf(x.startDate)! <= today && plainOf(x.endDate)! >= today) ?? p.periods[0] ?? null;
      return { pkg: p, period };
    })
    .filter((x) => x.period);
  const periodIds = current.map((c) => c.period!.id);

  const recentCutoff = new Date(Date.now() - 60 * 86400_000);
  const videos = await db.video.findMany({
    where: {
      clientId,
      OR: [
        ...(periodIds.length ? [{ packagePeriodId: { in: periodIds } }] : []),
        { packagePeriodId: null, OR: [{ stage: { category: { not: "DELIVERED" } } }, { deliveredAt: { gte: recentCutoff } }] },
      ],
    },
    orderBy: [{ stage: { position: "asc" } }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      packagePeriodId: true,
      isExtra: true,
      shootDate: true,
      reviewUrl: true,
      deliveryUrl: true,
      deliveredAt: true,
      stage: { select: { category: true } },
      approvals: { orderBy: { createdAt: "desc" }, take: 1, select: { decision: true, byName: true, createdAt: true, note: true } },
    },
  });

  const progress = current.map(({ pkg, period }) => ({
    packageId: pkg.id,
    name: pkg.name,
    type: pkg.type,
    start: plainOf(period!.startDate)!,
    end: plainOf(period!.endDate)!,
    progress: computePeriodProgress(
      period!,
      videos.filter((v) => v.packagePeriodId === period!.id).map((v) => ({ category: v.stage.category, isExtra: v.isExtra })),
    ),
  }));

  const scripts = await db.script.findMany({
    where: { clientId, status: { in: ["SENT", "CHANGES_REQUESTED", "APPROVED"] }, versions: { some: { sentToClient: true } } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, status: true, approvedVersionId: true, versions: { where: { sentToClient: true }, orderBy: { version: "desc" }, take: 1, select: { id: true, version: true, createdAt: true } } },
  });

  const invoices = await db.invoice.findMany({
    where: { clientId, status: "SENT" },
    orderBy: { issueDate: "desc" },
    take: 24,
    select: { id: true, number: true, description: true, issueDate: true, dueDate: true, status: true, totalCents: true, payments: { select: { amountCents: true } } },
  });

  const files = await db.attachment.findMany({
    where: { clientId, visibleToClient: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true },
  });

  return {
    today,
    progress,
    videos: videos.map((v) => ({
      id: v.id,
      title: v.title,
      category: v.stage.category,
      isExtra: v.isExtra,
      inPackage: Boolean(v.packagePeriodId),
      filmingOn: v.shootDate && plainOf(v.shootDate)! >= addDaysPlain(today, -1) ? v.shootDate : null,
      reviewUrl: ["AWAITING_APPROVAL", "APPROVED", "DELIVERED"].includes(v.stage.category) ? v.reviewUrl : null,
      deliveryUrl: ["APPROVED", "DELIVERED"].includes(v.stage.category) ? v.deliveryUrl : null,
      lastDecision: v.approvals[0] ?? null,
    })),
    scripts: scripts.map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      sentVersion: s.versions[0] ?? null,
      approvedIsLatest: Boolean(s.approvedVersionId && s.versions[0] && s.approvedVersionId === s.versions[0].id),
    })),
    invoices: invoices.map((i) => {
      const st = paymentState({ status: i.status, totalCents: i.totalCents, dueDate: plainOf(i.dueDate)! }, i.payments, today);
      return { id: i.id, number: i.number, description: i.description, issueDate: plainOf(i.issueDate)!, dueDate: plainOf(i.dueDate)!, totalCents: i.totalCents, ...st };
    }),
    files,
  };
}

/** Script as the client sees it: the latest SENT version only. Drafts are never exposed. */
export async function loadPortalScript(link: LinkLike, scriptId: string) {
  const script = await db.script.findUnique({
    where: { id: scriptId },
    select: {
      id: true,
      title: true,
      clientId: true,
      status: true,
      approvedVersionId: true,
      versions: { where: { sentToClient: true }, orderBy: { version: "desc" }, take: 1, select: { id: true, version: true, content: true, createdAt: true, approvals: { orderBy: { createdAt: "desc" }, select: { id: true, decision: true, byName: true, note: true, createdAt: true } } } },
      comments: {
        where: { OR: [{ source: "CLIENT" }, { parent: { source: "CLIENT" } }] },
        orderBy: { createdAt: "asc" },
        select: { id: true, parentId: true, authorName: true, body: true, source: true, createdAt: true, version: { select: { version: true } } },
      },
    },
  });
  if (!script || !linkCanAccessScript(link, script)) return null;
  const v = script.versions[0];
  if (!v || !["SENT", "CHANGES_REQUESTED", "APPROVED"].includes(script.status)) return null;
  return {
    id: script.id,
    title: script.title,
    status: script.status,
    version: { id: v.id, version: v.version, createdAt: v.createdAt, content: contentOf(v.content as Record<string, unknown>), approvals: v.approvals },
    isApproved: script.approvedVersionId === v.id,
    awaitingDecision: script.status === "SENT",
    comments: script.comments.map((c) => ({ ...c, version: c.version?.version ?? null })),
  };
}
