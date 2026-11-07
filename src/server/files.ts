"use server";
import { revalidatePath } from "next/cache";
import type { AttachmentKind } from "@prisma/client";
import { db } from "@/lib/db";
import { assertUser } from "./auth";
import { runAction, UserError, type ActionResult } from "./action";
import { ALLOWED_MIME, MAX_UPLOAD_BYTES, deleteFile, putFile } from "./storage";
import { logActivity } from "./activity";

const KINDS: AttachmentKind[] = ["CONTRACT", "RECEIPT", "INVOICE_PDF", "BRAND", "DELIVERABLE", "OTHER"];

/** Upload one or more files and attach them to a client, invoice, expense or video. */
export async function uploadAttachments(fd: FormData): Promise<ActionResult<{ ids: string[] }>> {
  return runAction(async () => {
    const target = {
      clientId: (fd.get("clientId") as string) || null,
      invoiceId: (fd.get("invoiceId") as string) || null,
      expenseId: (fd.get("expenseId") as string) || null,
      videoId: (fd.get("videoId") as string) || null,
    };
    const finance = Boolean(target.invoiceId || target.expenseId);
    const user = await assertUser(finance ? "finance:edit" : "production:edit");
    const kind = (fd.get("kind") as AttachmentKind) || "OTHER";
    if (!KINDS.includes(kind)) throw new UserError("Unknown file type");
    const visibleToClient = fd.get("visibleToClient") === "on" || fd.get("visibleToClient") === "true";
    const files = fd.getAll("files").filter((f): f is File => typeof f !== "string" && f.size > 0);
    if (!files.length) throw new UserError("Choose a file to upload");

    // Derive the client from the parent record so files always show on the client workspace.
    let clientId = target.clientId;
    if (!clientId && target.invoiceId) clientId = (await db.invoice.findUnique({ where: { id: target.invoiceId }, select: { clientId: true } }))?.clientId ?? null;
    if (!clientId && target.videoId) clientId = (await db.video.findUnique({ where: { id: target.videoId }, select: { clientId: true } }))?.clientId ?? null;
    if (!clientId && target.expenseId) clientId = (await db.expense.findUnique({ where: { id: target.expenseId }, select: { clientId: true } }))?.clientId ?? null;

    const ids: string[] = [];
    for (const f of files) {
      if (f.size > MAX_UPLOAD_BYTES) throw new UserError(`${f.name} is larger than 20 MB`);
      const mime = f.type || "application/octet-stream";
      if (!ALLOWED_MIME.includes(mime)) throw new UserError(`${f.name}: this file type isn't supported`);
      const key = await putFile(Buffer.from(await f.arrayBuffer()), f.name);
      const a = await db.attachment.create({
        data: { fileName: f.name.slice(0, 200), mimeType: mime, sizeBytes: f.size, storageKey: key, kind, visibleToClient, ...target, clientId, uploadedById: user.id },
      });
      ids.push(a.id);
    }
    await logActivity({ actor: user, action: "file.upload", entityType: "attachment", clientId, summary: `Uploaded ${files.length === 1 ? files[0]!.name : `${files.length} files`}` });
    revalidatePath("/", "layout");
    return { ok: true as const, data: { ids }, message: files.length === 1 ? "File uploaded" : `${files.length} files uploaded` };
  });
}

export async function deleteAttachment(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const a = await db.attachment.findUnique({ where: { id } });
    if (!a) throw new UserError("File not found");
    const user = await assertUser(a.invoiceId || a.expenseId ? "finance:edit" : "production:edit");
    await db.attachment.delete({ where: { id } });
    await deleteFile(a.storageKey);
    await logActivity({ actor: user, action: "file.delete", entityType: "attachment", clientId: a.clientId, summary: `Deleted ${a.fileName}` });
    revalidatePath("/", "layout");
    return { ok: true as const, message: "File deleted" };
  });
}

export async function toggleAttachmentVisibility(id: string, visible: boolean): Promise<ActionResult> {
  return runAction(async () => {
    await assertUser("production:edit");
    await db.attachment.update({ where: { id }, data: { visibleToClient: visible } });
    revalidatePath("/", "layout");
    return { ok: true as const, message: visible ? "Visible in client portal" : "Hidden from client portal" };
  });
}
