import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { todayMalta } from "@/lib/dates";
import { RULES, ruleStates } from "./rules";

const THROTTLE_MS = 10 * 60_000;
let running: Promise<unknown> | null = null;

/** Run all enabled rules now. Records an AutomationRun with per-rule results and errors. */
export async function runAutomations(trigger: string) {
  if (running) {
    await running.catch(() => {});
  }
  const p = (async () => {
    const settings = await db.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
    const run = await db.automationRun.create({ data: { trigger } });
    const states = new Map((await ruleStates()).map((r) => [r.key, r.enabled]));
    const now = new Date();
    const ctx = { today: todayMalta(now), now, settings };
    const result: Record<string, unknown> = {};
    const errors: string[] = [];
    for (const rule of RULES) {
      if (!states.get(rule.key)) {
        result[rule.key] = { skipped: "disabled" };
        continue;
      }
      try {
        result[rule.key] = await rule.run(ctx);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result[rule.key] = { error: msg.slice(0, 500) };
        errors.push(`${rule.key}: ${msg.slice(0, 200)}`);
        console.error(`[automation:${rule.key}]`, e);
      }
    }
    await db.automationRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), result: result as Prisma.InputJsonValue, error: errors.length ? errors.join("\n") : null },
    });
    return { id: run.id, result, errors };
  })();
  running = p;
  try {
    return await p;
  } finally {
    running = null;
  }
}

/**
 * Throttled background run used while rendering the app (at most once per 10 minutes).
 * Never throws — automation problems must not break page rendering.
 */
export async function maybeRunAutomations() {
  try {
    if (running) return;
    const last = await db.automationRun.findFirst({ orderBy: { startedAt: "desc" }, select: { startedAt: true } });
    if (last && Date.now() - last.startedAt.getTime() < THROTTLE_MS) return;
    await runAutomations("auto");
  } catch (e) {
    console.error("[automations] background run failed", e);
  }
}
