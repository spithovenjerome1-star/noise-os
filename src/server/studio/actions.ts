"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { EquipmentStatus, LibraryType } from "@prisma/client";
import { db } from "@/lib/db";
import { assertUser } from "@/server/auth";
import { can } from "@/lib/permissions";
import { runAction, formToObject, UserError, type ActionResult } from "@/server/action";
import { logActivity } from "@/server/activity";
import { dbDateOrNull } from "@/lib/dates";
import { zDate, zId, zMoney, zOpt, zReq } from "@/server/zod";

const LIB_TYPES: LibraryType[] = ["CONCEPT", "HOOK", "CAPTION", "SHOT_LIST", "TEMPLATE"];

export async function saveLibraryItem(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const d = z
      .object({ id: zId, type: z.enum(LIB_TYPES as [LibraryType, ...LibraryType[]]), title: zReq("Title", 200), body: zReq("Content", 20000), tags: zOpt(500), clientId: zId })
      .parse(formToObject(fd));
    const tags = [...new Set((d.tags ?? "").split(",").map((t) => t.trim().toLowerCase().replace(/^#/, "")).filter(Boolean))].slice(0, 20);
    const data = { type: d.type, title: d.title, body: d.body, tags, clientId: d.clientId };
    const item = d.id ? await db.libraryItem.update({ where: { id: d.id }, data }) : await db.libraryItem.create({ data });
    await logActivity({ actor: user, action: d.id ? "library.update" : "library.create", entityType: "library", entityId: item.id, clientId: d.clientId, summary: `${d.id ? "Updated" : "Added"} “${d.title}” to the creative library` });
    revalidatePath("/library");
    return { ok: true as const, message: d.id ? "Saved" : "Added to library" };
  });
}

export async function deleteLibraryItem(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const item = await db.libraryItem.delete({ where: { id } });
    await logActivity({ actor: user, action: "library.delete", entityType: "library", entityId: id, summary: `Removed “${item.title}” from the creative library` });
    revalidatePath("/library");
    return { ok: true as const, message: "Deleted" };
  });
}

const EQ_STATUS: EquipmentStatus[] = ["AVAILABLE", "IN_REPAIR", "RETIRED"];

export async function saveEquipment(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const d = z
      .object({
        id: zId,
        name: zReq("Name", 200),
        category: zReq("Category", 100),
        serialNumber: zOpt(100),
        purchasedOn: zDate,
        purchaseCents: zMoney,
        status: z.enum(EQ_STATUS as [EquipmentStatus, ...EquipmentStatus[]]),
        notes: zOpt(5000),
      })
      .parse(formToObject(fd));
    const financeEdit = can(user.role, "finance:edit");
    const data = {
      name: d.name,
      category: d.category,
      serialNumber: d.serialNumber,
      purchasedOn: dbDateOrNull(d.purchasedOn),
      status: d.status,
      notes: d.notes,
      // Purchase price is financial information: only finance users can set it.
      ...(financeEdit ? { purchaseCents: d.purchaseCents } : {}),
    };
    if (d.id) await db.equipment.update({ where: { id: d.id }, data });
    else await db.equipment.create({ data });
    await logActivity({ actor: user, action: d.id ? "equipment.update" : "equipment.create", entityType: "equipment", entityId: d.id, summary: `${d.id ? "Updated" : "Added"} equipment “${d.name}”` });
    revalidatePath("/equipment");
    return { ok: true as const, message: d.id ? "Saved" : "Equipment added" };
  });
}

export async function deleteEquipment(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const upcoming = await db.eventEquipment.count({ where: { equipmentId: id, event: { endsAt: { gt: new Date() } } } });
    if (upcoming) throw new UserError(`It's booked for ${upcoming} upcoming event(s). Mark it as retired instead, or remove it from those events first.`);
    const e = await db.equipment.delete({ where: { id } });
    await logActivity({ actor: user, action: "equipment.delete", entityType: "equipment", entityId: id, summary: `Deleted equipment “${e.name}”` });
    revalidatePath("/equipment");
    return { ok: true as const, message: "Deleted" };
  });
}
