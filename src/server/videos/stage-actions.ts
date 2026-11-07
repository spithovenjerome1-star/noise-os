"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { STAGE_COLORS } from "@/lib/labels";
import { assertUser } from "../auth";
import { formToObject, runAction, UserError, type ActionResult } from "../action";
import { zReq } from "../zod";
import { logActivity } from "../activity";

const CATEGORIES = ["PLANNED", "FILMED", "EDITING", "AWAITING_APPROVAL", "APPROVED", "DELIVERED"] as const;
const colorSchema = z.string().refine((c) => c in STAGE_COLORS, "Choose a colour");

function done() {
  revalidatePath("/videos");
  revalidatePath("/videos/stages");
}

export async function createStage(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("settings:manage");
    const d = z.object({ name: zReq("Name", 60), category: z.enum(CATEGORIES), color: colorSchema }).parse(formToObject(fd));
    const max = await db.stage.aggregate({ _max: { position: true } });
    await db.stage.create({ data: { ...d, position: (max._max.position ?? 0) + 1 } });
    await logActivity({ actor: user, action: "stage.create", entityType: "stage", summary: `Added pipeline stage “${d.name}”` });
    done();
    return { ok: true as const, message: "Stage added" };
  });
}

export async function updateStage(id: string, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("settings:manage");
    const d = z.object({ name: zReq("Name", 60), category: z.enum(CATEGORIES), color: colorSchema }).parse(formToObject(fd));
    const s = await db.stage.update({ where: { id }, data: d });
    await logActivity({ actor: user, action: "stage.update", entityType: "stage", entityId: id, summary: `Updated pipeline stage “${s.name}”` });
    done();
    return { ok: true as const, message: "Stage saved" };
  });
}

export async function moveStage(id: string, dir: -1 | 1): Promise<ActionResult> {
  return runAction(async () => {
    await assertUser("settings:manage");
    const stages = await db.stage.findMany({ where: { archived: false }, orderBy: { position: "asc" } });
    const i = stages.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= stages.length) return { ok: true as const };
    [stages[i], stages[j]] = [stages[j]!, stages[i]!];
    await db.$transaction(stages.map((s, idx) => db.stage.update({ where: { id: s.id }, data: { position: idx } })));
    done();
    return { ok: true as const, message: "Order updated" };
  });
}

export async function archiveStage(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("settings:manage");
    const count = await db.video.count({ where: { stageId: id } });
    if (count > 0) throw new UserError(`Move the ${count} video${count === 1 ? "" : "s"} out of this stage first`);
    const active = await db.stage.count({ where: { archived: false } });
    if (active <= 2) throw new UserError("The pipeline needs at least two stages");
    const s = await db.stage.update({ where: { id }, data: { archived: true } });
    await logActivity({ actor: user, action: "stage.archive", entityType: "stage", entityId: id, summary: `Archived pipeline stage “${s.name}”` });
    done();
    return { ok: true as const, message: "Stage archived" };
  });
}
