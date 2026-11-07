import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { plainOf, utcToMaltaLocalInput } from "@/lib/dates";

export const videoListInclude = {
  stage: { select: { id: true, name: true, category: true, color: true } },
  client: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true } },
  packagePeriod: { select: { id: true, package: { select: { name: true } } } },
  project: { select: { id: true, name: true } },
} satisfies Prisma.VideoInclude;

type VideoRow = Prisma.VideoGetPayload<{ include: typeof videoListInclude }>;

/** Serializable shape for client components. */
export function toVideoDTO(v: VideoRow) {
  return {
    id: v.id,
    title: v.title,
    clientId: v.clientId,
    clientName: v.client.name,
    stageId: v.stageId,
    stageName: v.stage.name,
    category: v.stage.category,
    stageColor: v.stage.color,
    position: v.position,
    priority: v.priority,
    assigneeId: v.assigneeId,
    assigneeName: v.assignee?.name ?? null,
    deadline: plainOf(v.deadline),
    deadlineOverridden: v.deadlineOverridden,
    filmedOn: plainOf(v.filmedOn),
    shootDate: v.shootDate ? v.shootDate.toISOString() : null,
    shootLocal: utcToMaltaLocalInput(v.shootDate),
    isExtra: v.isExtra,
    packageName: v.packagePeriod?.package.name ?? null,
    packagePeriodId: v.packagePeriodId,
    projectId: v.projectId,
    projectName: v.project?.name ?? null,
    description: v.description,
    footageUrl: v.footageUrl,
    premiereUrl: v.premiereUrl,
    reviewUrl: v.reviewUrl,
    deliveryUrl: v.deliveryUrl,
    revisionNotes: v.revisionNotes,
  };
}

export type VideoDTO = ReturnType<typeof toVideoDTO>;

export async function loadVideos(where: Prisma.VideoWhereInput = {}) {
  const rows = await db.video.findMany({ where, include: videoListInclude, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  return rows.map(toVideoDTO);
}
