"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertUser } from "@/server/auth";
import { runAction, UserError, type ActionResult } from "@/server/action";
import { logActivity } from "@/server/activity";
import { RULES } from "./rules";
import { runAutomations } from "./run";

export async function runAutomationsNow(): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const r = await runAutomations(`manual:${user.name}`);
    revalidatePath("/", "layout");
    return { ok: true as const, message: r.errors.length ? `Finished with ${r.errors.length} rule error(s)` : "Automations finished" };
  });
}

export async function setRuleEnabled(key: string, enabled: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("settings:manage");
    if (!RULES.some((r) => r.key === key)) throw new UserError("Unknown rule");
    await db.automationRule.upsert({ where: { key }, update: { enabled }, create: { key, enabled } });
    await logActivity({ actor: user, action: "automation.toggle", entityType: "automation", entityId: key, summary: `${enabled ? "Enabled" : "Disabled"} automation “${RULES.find((r) => r.key === key)!.title}”` });
    revalidatePath("/settings");
    return { ok: true as const, message: enabled ? "Automation enabled" : "Automation disabled" };
  });
}

export async function markNotificationRead(id: string, read = true): Promise<ActionResult> {
  return runAction(async () => {
    await assertUser();
    await db.notification.update({ where: { id }, data: { readAt: read ? new Date() : null } });
    revalidatePath("/", "layout");
    return { ok: true as const };
  });
}

export async function resolveNotification(id: string, resolved = true): Promise<ActionResult> {
  return runAction(async () => {
    await assertUser();
    await db.notification.update({ where: { id }, data: { resolvedAt: resolved ? new Date() : null, readAt: resolved ? new Date() : undefined } });
    revalidatePath("/", "layout");
    return { ok: true as const, message: resolved ? "Resolved" : "Reopened" };
  });
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  return runAction(async () => {
    await assertUser();
    const r = await db.notification.updateMany({ where: { readAt: null, resolvedAt: null }, data: { readAt: new Date() } });
    revalidatePath("/", "layout");
    return { ok: true as const, message: `Marked ${r.count} as read` };
  });
}
