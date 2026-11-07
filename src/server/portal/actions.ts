"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { runAction, UserError, type ActionResult } from "../action";
import { logActivity } from "../activity";
import { portalActor } from "./context";
import { linkCanAccessClientResource, linkCanAccessScript } from "@/lib/permissions";
import { clientCanReviewVideo, stageAfterClientDecision } from "@/lib/domain/portal";

type Decision = "APPROVED" | "CHANGES_REQUESTED";

function cleanNote(note: string | null | undefined, required: boolean) {
  const n = (note ?? "").trim().slice(0, 4000);
  if (required && !n) throw new UserError("Tell us what you'd like changed.");
  return n || null;
}

function refresh(token: string) {
  revalidatePath(`/portal/${token}`, "layout");
}

export async function portalSetName(token: string, name: string): Promise<ActionResult> {
  return runAction(async () => {
    if (!name.trim()) throw new UserError("Please enter your name.");
    await portalActor(token, name);
    refresh(token);
    return { ok: true as const, message: `Thanks, ${name.trim().split(" ")[0]}` };
  });
}

export async function portalDecideVideo(token: string, videoId: string, decision: Decision, note?: string | null, name?: string | null): Promise<ActionResult> {
  return runAction(async () => {
    if (decision !== "APPROVED" && decision !== "CHANGES_REQUESTED") throw new UserError("Unknown decision");
    const { link, name: byName, ipHash } = await portalActor(token, name);
    const text = cleanNote(note, decision === "CHANGES_REQUESTED");
    const video = await db.video.findUnique({ where: { id: videoId }, select: { id: true, title: true, clientId: true, revisionNotes: true, stage: { select: { category: true } } } });
    if (!video || !linkCanAccessClientResource(link, video)) throw new UserError("This video isn't available.");
    if (!clientCanReviewVideo(video.stage.category)) throw new UserError("This video isn't waiting for your review right now.");
    const stages = await db.stage.findMany({ where: { archived: false }, select: { id: true, name: true, position: true, category: true } });
    const target = stageAfterClientDecision(stages, decision);
    const stamp = new Date().toLocaleString("en-GB", { timeZone: "Europe/Malta", dateStyle: "medium", timeStyle: "short" });

    await db.$transaction(async (tx) => {
      const a = await tx.approval.create({ data: { decision, videoId: video.id, byName, shareLinkId: link.id, note: text, ipHash } });
      if (text) await tx.videoComment.create({ data: { videoId: video.id, authorName: byName, body: text, internal: false, source: "CLIENT" } });
      await tx.video.update({
        where: { id: video.id },
        data: {
          ...(target ? { stageId: target.id, stageChangedAt: new Date() } : {}),
          ...(decision === "APPROVED" ? { approvedAt: new Date() } : {}),
          ...(decision === "CHANGES_REQUESTED" && text ? { revisionNotes: [`${stamp} — ${byName}:\n${text}`, video.revisionNotes].filter(Boolean).join("\n\n") } : {}),
        },
      });
      await tx.notification.create({
        data: {
          type: decision === "APPROVED" ? "video.client_approved" : "video.revision_requested",
          severity: decision === "APPROVED" ? "INFO" : "WARNING",
          title: decision === "APPROVED" ? `${byName} approved “${video.title}”` : `${byName} requested a revision on “${video.title}”`,
          body: text,
          href: `/videos/${video.id}`,
          dedupeKey: `${decision === "APPROVED" ? "video-approved" : "video-revision"}:${a.id}`,
          clientId: video.clientId,
        },
      });
      await logActivity(
        { actorLabel: `${byName} (client)`, action: decision === "APPROVED" ? "video.client_approve" : "video.client_revision", entityType: "video", entityId: video.id, clientId: video.clientId, summary: decision === "APPROVED" ? `Client approved “${video.title}”` : `Client requested a revision on “${video.title}”`, meta: { approvalId: a.id, via: "portal" } },
        tx,
      );
    });
    refresh(token);
    return { ok: true as const, message: decision === "APPROVED" ? "Approved — thank you!" : "Revision requested. We're on it." };
  });
}

export async function portalDecideScript(token: string, scriptId: string, decision: Decision, note?: string | null, name?: string | null): Promise<ActionResult> {
  return runAction(async () => {
    if (decision !== "APPROVED" && decision !== "CHANGES_REQUESTED") throw new UserError("Unknown decision");
    const { link, name: byName, ipHash } = await portalActor(token, name);
    const text = cleanNote(note, decision === "CHANGES_REQUESTED");
    const script = await db.script.findUnique({
      where: { id: scriptId },
      select: { id: true, title: true, clientId: true, status: true, revision: true, versions: { where: { sentToClient: true }, orderBy: { version: "desc" }, take: 1, select: { id: true, version: true, revision: true } } },
    });
    if (!script || !linkCanAccessScript(link, script)) throw new UserError("This script isn't available.");
    const v = script.versions[0];
    if (!v) throw new UserError("This script isn't available.");
    if (script.status !== "SENT") throw new UserError("This script isn't waiting for your decision right now.");

    await db.$transaction(async (tx) => {
      const a = await tx.approval.create({ data: { decision, scriptVersionId: v.id, byName, shareLinkId: link.id, note: text, ipHash } });
      if (text) await tx.scriptComment.create({ data: { scriptId: script.id, versionId: v.id, authorName: byName, body: text, source: "CLIENT" } });
      if (decision === "APPROVED") {
        // Approval is pinned to the version the client saw. If we edited since, it is flagged outdated.
        const current = script.revision === v.revision;
        await tx.script.update({ where: { id: script.id }, data: { approvedVersionId: v.id, status: current ? "APPROVED" : "DRAFT" } });
      } else {
        await tx.script.update({ where: { id: script.id }, data: { status: "CHANGES_REQUESTED" } });
      }
      await tx.notification.create({
        data: {
          type: decision === "APPROVED" ? "script.client_approved" : "script.changes_requested",
          severity: decision === "APPROVED" ? "INFO" : "WARNING",
          title: decision === "APPROVED" ? `${byName} approved script “${script.title}” (v${v.version})` : `${byName} requested changes to “${script.title}”`,
          body: text,
          href: `/scripts/${script.id}`,
          dedupeKey: `${decision === "APPROVED" ? "script-approved" : "script-changes"}:${a.id}`,
          clientId: script.clientId,
        },
      });
      await logActivity(
        { actorLabel: `${byName} (client)`, action: decision === "APPROVED" ? "script.client_approve" : "script.client_changes", entityType: "script", entityId: script.id, clientId: script.clientId, summary: decision === "APPROVED" ? `Client approved “${script.title}” v${v.version}` : `Client requested changes to “${script.title}”`, meta: { approvalId: a.id, version: v.version, via: "portal" } },
        tx,
      );
    });
    refresh(token);
    return { ok: true as const, message: decision === "APPROVED" ? "Script approved — thank you!" : "Changes requested. We'll send an updated version." };
  });
}

export async function portalCommentScript(token: string, scriptId: string, body: string, parentId?: string | null, name?: string | null): Promise<ActionResult> {
  return runAction(async () => {
    const { link, name: byName } = await portalActor(token, name);
    const text = body.trim().slice(0, 4000);
    if (!text) throw new UserError("Write a comment first.");
    const script = await db.script.findUnique({
      where: { id: scriptId },
      select: { id: true, title: true, clientId: true, status: true, versions: { where: { sentToClient: true }, orderBy: { version: "desc" }, take: 1, select: { id: true } } },
    });
    if (!script || !linkCanAccessScript(link, script) || !script.versions[0]) throw new UserError("This script isn't available.");
    if (parentId) {
      const p = await db.scriptComment.findUnique({ where: { id: parentId }, select: { scriptId: true, source: true } });
      if (!p || p.scriptId !== script.id || p.source !== "CLIENT") throw new UserError("Thread not found.");
    }
    const c = await db.scriptComment.create({ data: { scriptId: script.id, versionId: script.versions[0].id, parentId: parentId ?? null, authorName: byName, body: text, source: "CLIENT" } });
    await db.notification.create({
      data: { type: "script.client_comment", severity: "INFO", title: `${byName} commented on “${script.title}”`, body: text, href: `/scripts/${script.id}`, dedupeKey: `script-comment:${c.id}`, clientId: script.clientId },
    });
    await logActivity({ actorLabel: `${byName} (client)`, action: "script.client_comment", entityType: "script", entityId: script.id, clientId: script.clientId, summary: `Client commented on “${script.title}”` });
    refresh(token);
    return { ok: true as const, message: "Comment sent" };
  });
}
