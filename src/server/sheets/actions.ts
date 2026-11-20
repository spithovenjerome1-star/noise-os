"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertUser } from "@/server/auth";
import { formToObject, runAction, UserError, type ActionResult } from "@/server/action";
import { logActivity } from "@/server/activity";
import { zBool, zOpt, zReq } from "@/server/zod";
import { spreadsheetIdFrom } from "@/lib/domain/sheets";
import { syncSheet } from "./run";
import type { SyncResult } from "./sync";

const KINDS = ["BUSINESS_ACCOUNT", "CLIENT_VIDEO_LOG", "CLIENT_CONTENT_LIST", "EDITING_LOG"] as const;

export async function saveSheetSource(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("settings:manage");
    const d = z
      .object({
        id: zOpt(64),
        name: zReq("Name", 100),
        link: zReq("Link", 500),
        kind: z.enum(KINDS, { errorMap: () => ({ message: "Choose what this sheet contains" }) }),
        clientId: zOpt(64),
        clientAliases: zOpt(4000),
        enabled: zBool,
      })
      .parse(formToObject(fd));
    const spreadsheetId = spreadsheetIdFrom(d.link);
    if (!spreadsheetId) throw new UserError("Paste the full Google Sheets link (it contains /spreadsheets/d/…).");
    const needsClient = d.kind === "CLIENT_VIDEO_LOG" || d.kind === "CLIENT_CONTENT_LIST";
    if (needsClient && !d.clientId) throw new UserError("Choose the client this sheet belongs to.");
    if (d.clientId && !(await db.client.findUnique({ where: { id: d.clientId }, select: { id: true } }))) throw new UserError("That client no longer exists.");
    const data = {
      name: d.name,
      spreadsheetId,
      kind: d.kind,
      clientId: needsClient ? d.clientId : null,
      clientAliases: d.kind === "BUSINESS_ACCOUNT" ? d.clientAliases : null,
      enabled: d.enabled,
    };
    const dupe = await db.sheetSource.findFirst({ where: { spreadsheetId, kind: d.kind, ...(d.id ? { id: { not: d.id } } : {}) } });
    if (dupe) throw new UserError(`This sheet is already connected as “${dupe.name}”.`);
    if (d.id) await db.sheetSource.update({ where: { id: d.id }, data });
    else await db.sheetSource.create({ data });
    await logActivity({ actor: user, action: "sheets.source", entityType: "settings", summary: `${d.id ? "Updated" : "Connected"} Google Sheet “${d.name}”` });
    revalidatePath("/settings");
    return { ok: true as const, message: d.id ? "Sheet saved" : "Sheet connected. Use Preview to check it, then Sync now." };
  });
}

/** Disconnect a sheet. Records it created stay in the app as normal records. */
export async function deleteSheetSource(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("settings:manage");
    const s = await db.sheetSource.findUnique({ where: { id } });
    if (!s) throw new UserError("That sheet is no longer connected.");
    await db.$transaction([
      db.invoice.updateMany({ where: { syncSourceId: id }, data: { syncSourceId: null, syncKey: null } }),
      db.payment.updateMany({ where: { syncSourceId: id }, data: { syncSourceId: null, syncKey: null } }),
      db.expense.updateMany({ where: { syncSourceId: id }, data: { syncSourceId: null, syncKey: null } }),
      db.video.updateMany({ where: { syncSourceId: id }, data: { syncSourceId: null, syncKey: null } }),
      db.sheetSource.delete({ where: { id } }),
    ]);
    await logActivity({ actor: user, action: "sheets.disconnect", entityType: "settings", summary: `Disconnected Google Sheet “${s.name}”` });
    revalidatePath("/settings");
    return { ok: true as const, message: "Sheet disconnected. Its records stay in the app." };
  });
}

export async function runSheetSyncNow(id: string, dryRun: boolean): Promise<ActionResult<SyncResult>> {
  return runAction(async () => {
    await assertUser("settings:manage");
    const r = await syncSheet(id, { trigger: dryRun ? "preview" : "manual", dryRun });
    if (!dryRun) revalidatePath("/", "layout");
    else revalidatePath("/settings");
    if (r.status === "error") return { ok: false as const, error: r.error ?? "Sync failed" };
    return { ok: true as const, data: r, message: dryRun ? `Preview: ${r.summary}` : r.summary };
  });
}
