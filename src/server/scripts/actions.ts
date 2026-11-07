"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma, ScriptStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { assertUser } from "../auth";
import { runAction, formToObject, UserError, type ActionResult } from "../action";
import { zId, zOpt, zReq, zInt } from "../zod";
import { logActivity } from "../activity";
import { createShareLink, revokeShareLink } from "../share-links";
import { SCRIPT_SECTIONS, contentOf, statusAfterEdit, canSetStatusManually, type ScriptContent } from "@/lib/domain/scripts";

type Tx = Prisma.TransactionClient;

const sectionKeys = SCRIPT_SECTIONS.map((s) => s.key);

function revalidateScript(id: string) {
  revalidatePath(`/scripts/${id}`);
  revalidatePath("/scripts");
}

/** Freeze the current content as a version. Reuses the latest version if nothing changed since. */
async function freezeVersion(tx: Tx, scriptId: string, opts: { label?: string | null; sentToClient?: boolean; userId?: string | null; forceNew?: boolean }) {
  const script = await tx.script.findUniqueOrThrow({ where: { id: scriptId } });
  const latest = await tx.scriptVersion.findFirst({ where: { scriptId }, orderBy: { version: "desc" } });
  if (latest && latest.revision === script.revision && !opts.forceNew) {
    if (opts.sentToClient && !latest.sentToClient) return tx.scriptVersion.update({ where: { id: latest.id }, data: { sentToClient: true, label: latest.label ?? opts.label ?? null } });
    if (opts.label && !latest.label) return tx.scriptVersion.update({ where: { id: latest.id }, data: { label: opts.label } });
    return latest;
  }
  const content: ScriptContent = contentOf(script as unknown as Record<string, unknown>);
  return tx.scriptVersion.create({
    data: {
      scriptId,
      version: (latest?.version ?? 0) + 1,
      content,
      revision: script.revision,
      label: opts.label ?? null,
      sentToClient: Boolean(opts.sentToClient),
      createdById: opts.userId ?? null,
    },
  });
}

export async function createScript(fd: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const data = z.object({ title: zReq("Title", 200), clientId: zReq("Client", 64), videoId: zId }).parse(formToObject(fd));
    if (data.videoId) {
      const v = await db.video.findUnique({ where: { id: data.videoId }, select: { clientId: true, script: { select: { id: true } } } });
      if (!v || v.clientId !== data.clientId) throw new UserError("That video belongs to a different client.");
      if (v.script) throw new UserError("That video already has a script.");
    }
    const s = await db.script.create({ data: { title: data.title, clientId: data.clientId, videoId: data.videoId } });
    await logActivity({ actor: user, action: "script.create", entityType: "script", entityId: s.id, clientId: s.clientId, summary: `Created script “${s.title}”` });
    revalidatePath("/scripts");
    return { ok: true as const, data: { id: s.id }, message: "Script created" };
  });
}

/** Autosave. Only changed sections are sent. Every save bumps the revision. */
export async function saveScriptContent(id: string, patch: Partial<Record<string, string>>): Promise<ActionResult<{ revision: number; status: ScriptStatus }>> {
  return runAction(async () => {
    await assertUser("production:edit");
    const data: Partial<ScriptContent> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (!(sectionKeys as string[]).includes(k)) continue;
      if (typeof v !== "string" || v.length > 50000) throw new UserError("Section is too long");
      (data as Record<string, string>)[k] = v;
    }
    if (!Object.keys(data).length) {
      const s = await db.script.findUniqueOrThrow({ where: { id }, select: { revision: true, status: true } });
      return { ok: true as const, data: s };
    }
    const result = await db.$transaction(async (tx) => {
      const cur = await tx.script.findUniqueOrThrow({ where: { id } });
      const changed = Object.entries(data).some(([k, v]) => (cur as unknown as Record<string, string>)[k] !== v);
      if (!changed) return { revision: cur.revision, status: cur.status };
      const status = statusAfterEdit(cur.status);
      const u = await tx.script.update({ where: { id }, data: { ...data, revision: { increment: 1 }, status }, select: { revision: true, status: true } });
      return u;
    });
    revalidatePath("/scripts");
    return { ok: true as const, data: result };
  });
}

export async function updateScriptMeta(id: string, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const data = z.object({ title: zReq("Title", 200), videoId: zId }).parse(formToObject(fd));
    const s = await db.script.findUniqueOrThrow({ where: { id } });
    if (data.videoId && data.videoId !== s.videoId) {
      const v = await db.video.findUnique({ where: { id: data.videoId }, select: { clientId: true, script: { select: { id: true } } } });
      if (!v || v.clientId !== s.clientId) throw new UserError("That video belongs to a different client.");
      if (v.script && v.script.id !== id) throw new UserError("That video already has a script.");
    }
    await db.script.update({ where: { id }, data: { title: data.title, videoId: data.videoId } });
    await logActivity({ actor: user, action: "script.update", entityType: "script", entityId: id, clientId: s.clientId, summary: `Updated script “${data.title}”` });
    revalidateScript(id);
    return { ok: true as const, message: "Script updated" };
  });
}

export async function setScriptStatus(id: string, status: ScriptStatus): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    if (!canSetStatusManually(status)) throw new UserError("Use “Send to client” or record an approval instead.");
    const s = await db.script.update({ where: { id }, data: { status } });
    await logActivity({ actor: user, action: "script.status", entityType: "script", entityId: id, clientId: s.clientId, summary: `Script “${s.title}” moved to ${status.replace("_", " ").toLowerCase()}` });
    revalidateScript(id);
    return { ok: true as const, message: "Status updated" };
  });
}

export async function saveScriptVersion(id: string, label: string | null): Promise<ActionResult<{ version: number }>> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const v = await db.$transaction((tx) => freezeVersion(tx, id, { label: label?.trim().slice(0, 100) || null, userId: user.id }));
    revalidateScript(id);
    return { ok: true as const, data: { version: v.version }, message: `Saved as v${v.version}` };
  });
}

export async function sendScriptToClient(id: string): Promise<ActionResult<{ version: number }>> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const res = await db.$transaction(async (tx) => {
      const s = await tx.script.findUniqueOrThrow({ where: { id } });
      const hasContent = SCRIPT_SECTIONS.some((sec) => ((s as unknown as Record<string, string>)[sec.key] ?? "").trim());
      if (!hasContent) throw new UserError("Write something before sending it to the client.");
      const v = await freezeVersion(tx, id, { sentToClient: true, userId: user.id });
      await tx.script.update({ where: { id }, data: { status: "SENT" } });
      await logActivity({ actor: user, action: "script.send", entityType: "script", entityId: id, clientId: s.clientId, summary: `Sent “${s.title}” v${v.version} to client` }, tx);
      return v;
    });
    revalidateScript(id);
    return { ok: true as const, data: { version: res.version }, message: `v${res.version} is now visible to the client` };
  });
}

export async function restoreScriptVersion(id: string, versionId: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    await db.$transaction(async (tx) => {
      const v = await tx.scriptVersion.findUniqueOrThrow({ where: { id: versionId } });
      if (v.scriptId !== id) throw new UserError("Version doesn't belong to this script");
      const cur = await tx.script.findUniqueOrThrow({ where: { id } });
      const content = contentOf(v.content as Record<string, unknown>);
      await tx.script.update({ where: { id }, data: { ...content, revision: { increment: 1 }, status: statusAfterEdit(cur.status) } });
      await logActivity({ actor: user, action: "script.restore", entityType: "script", entityId: id, clientId: cur.clientId, summary: `Restored “${cur.title}” to v${v.version}` }, tx);
    });
    revalidateScript(id);
    return { ok: true as const, message: "Version restored into the draft" };
  });
}

/** Record an approval given outside the portal (e.g. on WhatsApp). Freezes the current content first. */
export async function recordScriptApproval(id: string, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const data = z.object({ byName: zReq("Who approved", 120), note: zOpt(1000) }).parse(formToObject(fd));
    await db.$transaction(async (tx) => {
      const s = await tx.script.findUniqueOrThrow({ where: { id } });
      const v = await freezeVersion(tx, id, { userId: user.id, sentToClient: true });
      const a = await tx.approval.create({ data: { decision: "APPROVED", scriptVersionId: v.id, byName: data.byName, byUserId: user.id, note: data.note ? `${data.note} (recorded by ${user.name})` : `Recorded by ${user.name}` } });
      await tx.script.update({ where: { id }, data: { status: "APPROVED", approvedVersionId: v.id } });
      await logActivity({ actor: user, action: "script.approve", entityType: "script", entityId: id, clientId: s.clientId, summary: `Recorded approval of “${s.title}” v${v.version} by ${data.byName}`, meta: { approvalId: a.id } }, tx);
    });
    revalidateScript(id);
    return { ok: true as const, message: "Approval recorded" };
  });
}

export async function addScriptComment(scriptId: string, body: string, parentId?: string | null): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const text = body.trim();
    if (!text) throw new UserError("Write a comment first");
    if (text.length > 5000) throw new UserError("Comment is too long");
    if (parentId) {
      const p = await db.scriptComment.findUnique({ where: { id: parentId }, select: { scriptId: true } });
      if (!p || p.scriptId !== scriptId) throw new UserError("Thread not found");
    }
    const latest = await db.scriptVersion.findFirst({ where: { scriptId }, orderBy: { version: "desc" }, select: { id: true } });
    await db.scriptComment.create({ data: { scriptId, parentId: parentId ?? null, versionId: latest?.id ?? null, authorId: user.id, authorName: user.name, body: text, source: "TEAM" } });
    revalidateScript(scriptId);
    return { ok: true as const, message: "Comment added" };
  });
}

export async function resolveScriptComment(id: string, resolved: boolean): Promise<ActionResult> {
  return runAction(async () => {
    await assertUser("production:edit");
    const c = await db.scriptComment.update({ where: { id }, data: { resolved } });
    revalidateScript(c.scriptId);
    return { ok: true as const, message: resolved ? "Thread resolved" : "Thread reopened" };
  });
}

export async function deleteScriptComment(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const c = await db.scriptComment.findUniqueOrThrow({ where: { id } });
    if (c.source === "CLIENT") throw new UserError("Client comments are kept for the record. Resolve the thread instead.");
    if (c.authorId !== user.id && user.role === "MEMBER") throw new UserError("You can only delete your own comments");
    await db.scriptComment.delete({ where: { id } });
    revalidateScript(c.scriptId);
    return { ok: true as const, message: "Comment deleted" };
  });
}

export async function createScriptShare(scriptId: string, fd: FormData): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const data = z.object({ label: zOpt(100), expiresInDays: zInt(1, 365) }).parse(formToObject(fd));
    const s = await db.script.findUniqueOrThrow({ where: { id: scriptId } });
    const { url } = await createShareLink({ scope: "SCRIPT", clientId: s.clientId, scriptId, label: data.label, expiresInDays: data.expiresInDays, createdById: user.id });
    await logActivity({ actor: user, action: "share.create", entityType: "script", entityId: scriptId, clientId: s.clientId, summary: `Created a share link for “${s.title}”` });
    revalidateScript(scriptId);
    return { ok: true as const, data: { url }, message: "Share link created" };
  });
}

export async function revokeShare(linkId: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const l = await revokeShareLink(linkId);
    await logActivity({ actor: user, action: "share.revoke", entityType: "share", entityId: linkId, clientId: l.clientId, summary: "Revoked a share link" });
    revalidatePath("/", "layout");
    return { ok: true as const, message: "Link revoked — it no longer works" };
  });
}

export async function deleteScript(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const s = await db.script.findUniqueOrThrow({ where: { id }, include: { versions: { include: { approvals: { select: { id: true } } } } } });
    if (s.versions.some((v) => v.approvals.length) && user.role === "MEMBER")
      throw new UserError("This script has a recorded client decision. Ask an admin to delete it.");
    await db.script.delete({ where: { id } });
    await logActivity({ actor: user, action: "script.delete", entityType: "script", entityId: id, clientId: s.clientId, summary: `Deleted script “${s.title}”` });
    revalidatePath("/scripts");
    return { ok: true as const, message: "Script deleted" };
  });
}
