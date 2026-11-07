"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertUser } from "../auth";
import { runAction, formToObject, type ActionResult } from "../action";
import { zInt, zOpt } from "../zod";
import { createShareLink, revokeShareLink } from "../share-links";
import { logActivity } from "../activity";

/** Create a client portal link (shown once). */
export async function createClientPortalLink(clientId: string, fd: FormData): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const user = await assertUser("clients:edit");
    const data = z.object({ label: zOpt(100), expiresInDays: zInt(1, 730) }).parse(formToObject(fd));
    const client = await db.client.findUniqueOrThrow({ where: { id: clientId }, select: { id: true, name: true } });
    const { url } = await createShareLink({ scope: "CLIENT_PORTAL", clientId, label: data.label, expiresInDays: data.expiresInDays, createdById: user.id });
    await logActivity({ actor: user, action: "portal.create", entityType: "client", entityId: clientId, clientId, summary: `Created a client portal link${data.label ? ` (${data.label})` : ""} for ${client.name}` });
    revalidatePath(`/clients/${clientId}`);
    return { ok: true as const, data: { url }, message: "Portal link created" };
  });
}

export async function revokeClientPortalLink(linkId: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("clients:edit");
    const l = await revokeShareLink(linkId);
    await logActivity({ actor: user, action: "portal.revoke", entityType: "client", entityId: l.clientId, clientId: l.clientId, summary: "Revoked a client portal link" });
    revalidatePath(`/clients/${l.clientId}`);
    return { ok: true as const, message: "Link revoked — it no longer works" };
  });
}
