import { db } from "@/lib/db";
import { fetchSpreadsheet, serviceAccount } from "./google";
import { runSheetSync, type SyncResult } from "./sync";

const AUTO_INTERVAL_MS = 15 * 60_000;
let autoRunning = false;

/** Sync one sheet now (Settings → Sync now / Preview). */
export async function syncSheet(sourceId: string, opts: { trigger: string; dryRun?: boolean }): Promise<SyncResult> {
  const source = await db.sheetSource.findUniqueOrThrow({ where: { id: sourceId } });
  return runSheetSync(db, source, { ...opts, fetch: fetchSpreadsheet });
}

/** Sync every enabled sheet, one after another. Used by the cron endpoint and the CLI. */
export async function syncAllSheets(trigger: string) {
  if (!hasCredentials()) return { skipped: "GOOGLE_SERVICE_ACCOUNT_JSON not set" as const, results: [] };
  const sources = await db.sheetSource.findMany({ where: { enabled: true }, orderBy: { createdAt: "asc" } });
  const results: { name: string; status: string; summary: string }[] = [];
  for (const s of sources) {
    try {
      const r = await runSheetSync(db, s, { trigger, fetch: fetchSpreadsheet });
      results.push({ name: s.name, status: r.status, summary: r.summary });
    } catch (e) {
      results.push({ name: s.name, status: "error", summary: e instanceof Error ? e.message : String(e) });
    }
  }
  return { results };
}

function hasCredentials() {
  try {
    return Boolean(serviceAccount());
  } catch {
    return false;
  }
}

/**
 * Background sync while the app is in use, at most every 15 minutes. Not awaited by pages,
 * so a slow Google response never delays rendering. Never throws.
 */
export function maybeSyncSheets() {
  if (autoRunning || !hasCredentials()) return;
  autoRunning = true;
  void (async () => {
    try {
      const last = await db.sheetSyncRun.findFirst({ where: { dryRun: false }, orderBy: { startedAt: "desc" }, select: { startedAt: true } });
      if (last && Date.now() - last.startedAt.getTime() < AUTO_INTERVAL_MS) return;
      await syncAllSheets("auto");
    } catch (e) {
      console.error("[sheets] background sync failed", e);
    } finally {
      autoRunning = false;
    }
  })();
}
