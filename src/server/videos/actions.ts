"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Priority } from "@prisma/client";
import { db } from "@/lib/db";
import { dbDateOrNull, maltaLocalToUtc, plainOf, todayMalta } from "@/lib/dates";
import { normalizeUrl } from "@/lib/utils";
import { assertUser } from "../auth";
import { formToObject, runAction, UserError, type ActionResult } from "../action";
import { zBool, zDate, zDateTime, zId, zOpt, zReq, zInt } from "../zod";
import { logActivity } from "../activity";
import { nextPositionInStage, resolveSchedule, stageStamps, syncShootEvent } from "./logic";

const PRIORITIES = ["URGENT", "HIGH", "NORMAL", "LOW"] as const;

const videoSchema = z.object({
  title: zReq("Title", 200),
  clientId: zReq("Client", 64),
  packagePeriodId: zId,
  projectId: zId,
  isExtra: zBool,
  description: zOpt(5000),
  stageId: zReq("Stage", 64),
  shootDate: zDateTime,
  filmedOn: zDate,
  deadline: zDate,
  deadlineOverridden: zBool,
  assigneeId: zId,
  priority: z.enum(PRIORITIES).default("NORMAL"),
  footageUrl: zOpt(1000),
  premiereUrl: zOpt(1000),
  reviewUrl: zOpt(1000),
  deliveryUrl: zOpt(1000),
  revisionNotes: zOpt(5000),
});

function revalidateVideos(id?: string, clientId?: string) {
  revalidatePath("/videos");
  if (id) revalidatePath(`/videos/${id}`);
  if (clientId) revalidatePath(`/clients/${clientId}`);
  revalidatePath("/");
}

async function validateRefs(d: { clientId: string; packagePeriodId: string | null; projectId: string | null; stageId: string; assigneeId: string | null }) {
  const [client, stage, period, project] = await Promise.all([
    db.client.findUnique({ where: { id: d.clientId }, select: { id: true } }),
    db.stage.findUnique({ where: { id: d.stageId } }),
    d.packagePeriodId ? db.packagePeriod.findUnique({ where: { id: d.packagePeriodId }, select: { package: { select: { clientId: true } } } }) : null,
    d.projectId ? db.project.findUnique({ where: { id: d.projectId }, select: { clientId: true } }) : null,
  ]);
  if (!client) throw new UserError("Choose a client");
  if (!stage) throw new UserError("Choose a stage");
  if (d.packagePeriodId && period?.package.clientId !== d.clientId) throw new UserError("That package belongs to a different client");
  if (d.projectId && project?.clientId !== d.clientId) throw new UserError("That project belongs to a different client");
  return { stage };
}

export async function createVideo(fd: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const d = videoSchema.parse(formToObject(fd));
    const { stage } = await validateRefs(d);
    const id = await db.$transaction(async (tx) => {
      const sched = await resolveSchedule(tx, {
        clientId: d.clientId,
        packagePeriodId: d.packagePeriodId,
        filmedOn: d.filmedOn,
        manualDeadline: d.deadline,
        overridden: d.deadlineOverridden,
        fromCategory: null,
        toCategory: stage.category,
      });
      // A brand-new video created directly in a later stage should not be stamped as filmed today unless the user said so.
      const filmedOn = stage.category === "PLANNED" ? d.filmedOn : sched.filmedOn;
      const stamps = stageStamps(null, stage.category, { approvedAt: null, deliveredAt: null });
      const v = await tx.video.create({
        data: {
          title: d.title,
          clientId: d.clientId,
          packagePeriodId: d.packagePeriodId,
          projectId: d.projectId,
          isExtra: d.isExtra,
          description: d.description,
          stageId: d.stageId,
          shootDate: d.shootDate ? maltaLocalToUtc(d.shootDate) : null,
          filmedOn: dbDateOrNull(filmedOn),
          deadline: dbDateOrNull(sched.deadline),
          deadlineOverridden: sched.overridden,
          assigneeId: d.assigneeId,
          priority: d.priority,
          footageUrl: normalizeUrl(d.footageUrl),
          premiereUrl: d.premiereUrl,
          reviewUrl: normalizeUrl(d.reviewUrl),
          deliveryUrl: normalizeUrl(d.deliveryUrl),
          revisionNotes: d.revisionNotes,
          position: await nextPositionInStage(tx, d.stageId),
          ...stamps,
        },
      });
      await syncShootEvent(tx, v);
      await logActivity({ actor: user, action: "video.create", entityType: "video", entityId: v.id, clientId: v.clientId, summary: `Created video “${v.title}”` }, tx);
      return v.id;
    });
    revalidateVideos(id, d.clientId);
    return { ok: true as const, data: { id }, message: "Video created" };
  });
}

export async function updateVideo(id: string, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const d = videoSchema.parse(formToObject(fd));
    const current = await db.video.findUnique({ where: { id }, include: { stage: true } });
    if (!current) throw new UserError("That video no longer exists");
    const { stage } = await validateRefs(d);
    await db.$transaction(async (tx) => {
      const sched = await resolveSchedule(tx, {
        clientId: d.clientId,
        packagePeriodId: d.packagePeriodId,
        filmedOn: d.filmedOn,
        manualDeadline: d.deadline,
        overridden: d.deadlineOverridden,
        fromCategory: current.stage.category,
        toCategory: stage.category,
      });
      const stageChanged = current.stageId !== d.stageId;
      const stamps = stageStamps(current.stage.category, stage.category, current);
      const v = await tx.video.update({
        where: { id },
        data: {
          title: d.title,
          clientId: d.clientId,
          packagePeriodId: d.packagePeriodId,
          projectId: d.projectId,
          isExtra: d.isExtra,
          description: d.description,
          stageId: d.stageId,
          shootDate: d.shootDate ? maltaLocalToUtc(d.shootDate) : null,
          filmedOn: dbDateOrNull(sched.filmedOn),
          deadline: dbDateOrNull(sched.deadline),
          deadlineOverridden: sched.overridden,
          assigneeId: d.assigneeId,
          priority: d.priority,
          footageUrl: normalizeUrl(d.footageUrl),
          premiereUrl: d.premiereUrl,
          reviewUrl: normalizeUrl(d.reviewUrl),
          deliveryUrl: normalizeUrl(d.deliveryUrl),
          revisionNotes: d.revisionNotes,
          ...(stageChanged ? { stageChangedAt: new Date(), position: await nextPositionInStage(tx, d.stageId) } : {}),
          ...stamps,
        },
      });
      await syncShootEvent(tx, v);
      await logActivity(
        {
          actor: user,
          action: stageChanged ? "video.stage" : "video.update",
          entityType: "video",
          entityId: id,
          clientId: v.clientId,
          summary: stageChanged ? `Moved “${v.title}” to ${stage.name}` : `Updated video “${v.title}”`,
        },
        tx,
      );
    });
    revalidateVideos(id, d.clientId);
    return { ok: true as const, data: { id }, message: "Video saved" };
  });
}

/** Move a video to a stage (and position) — used by the board's drag & drop. */
export async function moveVideo(id: string, stageId: string, position: number): Promise<ActionResult<{ deadline: string | null }>> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    if (!Number.isFinite(position)) throw new UserError("Invalid position");
    const [current, stage] = await Promise.all([
      db.video.findUnique({ where: { id }, include: { stage: true } }),
      db.stage.findUnique({ where: { id: stageId } }),
    ]);
    if (!current || !stage) throw new UserError("That video or stage no longer exists");
    const deadline = await db.$transaction(async (tx) => {
      if (current.stageId === stageId) {
        await tx.video.update({ where: { id }, data: { position } });
        return plainOf(current.deadline);
      }
      const r = await applyStage(tx, current, stage);
      await tx.video.update({ where: { id }, data: { ...r, position } });
      await logActivity({ actor: user, action: "video.stage", entityType: "video", entityId: id, clientId: current.clientId, summary: `Moved “${current.title}” to ${stage.name}` }, tx);
      return plainOf(r.deadline);
    });
    revalidateVideos(id, current.clientId);
    return { ok: true as const, data: { deadline } };
  });
}

type VideoWithStage = NonNullable<Awaited<ReturnType<typeof db.video.findUnique<{ where: { id: string }; include: { stage: true } }>>>>;

async function applyStage(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], current: VideoWithStage, stage: { id: string; category: VideoWithStage["stage"]["category"] }) {
  const sched = await resolveSchedule(tx, {
    clientId: current.clientId,
    packagePeriodId: current.packagePeriodId,
    filmedOn: plainOf(current.filmedOn),
    manualDeadline: plainOf(current.deadline),
    overridden: current.deadlineOverridden,
    fromCategory: current.stage.category,
    toCategory: stage.category,
  });
  return {
    stageId: stage.id,
    stageChangedAt: new Date(),
    filmedOn: dbDateOrNull(sched.filmedOn),
    deadline: dbDateOrNull(sched.deadline),
    deadlineOverridden: sched.overridden,
    ...stageStamps(current.stage.category, stage.category, current),
  };
}

const batchSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Select at least one video").max(500),
  stageId: z.string().optional(),
  assigneeId: z.string().nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

/** Batch update selected videos. Each field is optional; only provided fields change. */
export async function batchUpdateVideos(input: z.input<typeof batchSchema>): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const d = batchSchema.parse(input);
    const videos = await db.video.findMany({ where: { id: { in: d.ids } }, include: { stage: true } });
    const stage = d.stageId ? await db.stage.findUnique({ where: { id: d.stageId } }) : null;
    if (d.stageId && !stage) throw new UserError("That stage no longer exists");
    await db.$transaction(async (tx) => {
      let pos = stage ? await nextPositionInStage(tx, stage.id) : 0;
      for (const v of videos) {
        const data: Record<string, unknown> = {};
        if (stage && v.stageId !== stage.id) {
          Object.assign(data, await applyStage(tx, v, stage), { position: pos });
          pos += 1000;
        }
        if (d.assigneeId !== undefined) data.assigneeId = d.assigneeId || null;
        if (d.priority) data.priority = d.priority as Priority;
        if (d.deadline !== undefined) {
          data.deadline = dbDateOrNull(d.deadline);
          data.deadlineOverridden = Boolean(d.deadline);
        }
        if (Object.keys(data).length) await tx.video.update({ where: { id: v.id }, data });
      }
      const what = [stage && `moved to ${stage.name}`, d.assigneeId !== undefined && "reassigned", d.priority && `priority ${d.priority.toLowerCase()}`, d.deadline !== undefined && "deadline set"]
        .filter(Boolean)
        .join(", ");
      for (const clientId of new Set(videos.map((v) => v.clientId)))
        await logActivity({ actor: user, action: "video.batch", entityType: "video", clientId, summary: `Batch update (${videos.filter((v) => v.clientId === clientId).length} videos): ${what}` }, tx);
    });
    revalidateVideos();
    return { ok: true as const, data: { count: videos.length }, message: `${videos.length} video${videos.length === 1 ? "" : "s"} updated` };
  });
}

export async function deleteVideos(ids: string[]): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const list = z.array(z.string().min(1)).min(1).max(500).parse(ids);
    const videos = await db.video.findMany({ where: { id: { in: list } }, select: { id: true, title: true, clientId: true } });
    await db.$transaction(async (tx) => {
      await tx.calendarEvent.deleteMany({ where: { videoId: { in: list }, type: "SHOOT" } });
      await tx.video.deleteMany({ where: { id: { in: list } } });
      for (const v of videos) await logActivity({ actor: user, action: "video.delete", entityType: "video", entityId: v.id, clientId: v.clientId, summary: `Deleted video “${v.title}”` }, tx);
    });
    revalidateVideos();
    return { ok: true as const, data: { count: videos.length }, message: videos.length === 1 ? "Video deleted" : `${videos.length} videos deleted` };
  });
}

export async function addVideoComment(videoId: string, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const { body } = z.object({ body: zReq("Comment", 5000) }).parse(formToObject(fd));
    const v = await db.video.findUnique({ where: { id: videoId }, select: { clientId: true, title: true } });
    if (!v) throw new UserError("That video no longer exists");
    await db.videoComment.create({ data: { videoId, authorId: user.id, authorName: user.name, body, internal: true, source: "TEAM" } });
    revalidatePath(`/videos/${videoId}`);
    return { ok: true as const, message: "Comment added" };
  });
}

export async function deleteVideoComment(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const c = await db.videoComment.findUnique({ where: { id } });
    if (!c) throw new UserError("Comment not found");
    if (c.source === "CLIENT") throw new UserError("Client feedback is part of the approval record and can't be deleted");
    if (c.authorId !== user.id && user.role === "MEMBER") throw new UserError("You can only delete your own comments");
    await db.videoComment.delete({ where: { id } });
    revalidatePath(`/videos/${c.videoId}`);
    return { ok: true as const, message: "Comment deleted" };
  });
}

/** Create (or open) the script for a video. Returns the script id. */
export async function ensureVideoScript(videoId: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const v = await db.video.findUnique({ where: { id: videoId }, select: { id: true, title: true, clientId: true, script: { select: { id: true } } } });
    if (!v) throw new UserError("That video no longer exists");
    if (v.script) return { ok: true as const, data: { id: v.script.id } };
    const s = await db.script.create({ data: { title: v.title, clientId: v.clientId, videoId: v.id } });
    await logActivity({ actor: user, action: "script.create", entityType: "script", entityId: s.id, clientId: v.clientId, summary: `Started script for “${v.title}”` });
    revalidatePath(`/videos/${videoId}`);
    return { ok: true as const, data: { id: s.id }, message: "Script created" };
  });
}

const timeSchema = z.object({
  date: zDate,
  hours: zInt(0, 24),
  minutes: zInt(0, 59),
  note: zOpt(500),
});

export async function addVideoTime(videoId: string, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const d = timeSchema.parse(formToObject(fd));
    const total = (d.hours ?? 0) * 60 + (d.minutes ?? 0);
    if (total <= 0) return { ok: false as const, error: "Enter the time spent", fieldErrors: { hours: "Enter hours or minutes" } };
    const v = await db.video.findUnique({ where: { id: videoId }, select: { clientId: true, projectId: true, title: true } });
    if (!v) throw new UserError("That video no longer exists");
    await db.timeEntry.create({
      data: { userId: user.id, clientId: v.clientId, projectId: v.projectId, videoId, date: dbDateOrNull(d.date ?? todayMalta())!, minutes: total, note: d.note },
    });
    revalidatePath(`/videos/${videoId}`);
    return { ok: true as const, message: "Time logged" };
  });
}

export async function deleteTimeEntry(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const t = await db.timeEntry.findUnique({ where: { id } });
    if (!t) throw new UserError("Entry not found");
    if (user.role === "MEMBER" && t.userId !== user.id) throw new UserError("You can only delete your own time entries");
    await db.timeEntry.delete({ where: { id } });
    if (t.videoId) revalidatePath(`/videos/${t.videoId}`);
    return { ok: true as const, message: "Time entry deleted" };
  });
}
