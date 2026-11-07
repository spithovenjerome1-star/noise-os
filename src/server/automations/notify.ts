import "server-only";
import type { Severity } from "@prisma/client";
import { db } from "@/lib/db";

export type DesiredNotification = {
  dedupeKey: string;
  title: string;
  body?: string | null;
  href?: string | null;
  severity?: Severity;
  clientId?: string | null;
};

/**
 * Make the open notifications of `type` match `desired`:
 *  - create missing ones,
 *  - refresh the text of ones still open,
 *  - auto-resolve open ones whose condition no longer holds (unless keepStale).
 * Notifications a person resolved stay resolved for the same dedupeKey (no nagging).
 */
export async function syncNotifications(type: string, desired: DesiredNotification[], opts: { keepStale?: boolean } = {}) {
  const keys = desired.map((d) => d.dedupeKey);
  const existing = keys.length ? await db.notification.findMany({ where: { dedupeKey: { in: keys } } }) : [];
  const byKey = new Map(existing.map((n) => [n.dedupeKey, n]));
  let created = 0;
  let resolved = 0;
  for (const d of desired) {
    const e = byKey.get(d.dedupeKey);
    if (!e) {
      await db.notification.create({
        data: { type, dedupeKey: d.dedupeKey, title: d.title, body: d.body ?? null, href: d.href ?? null, severity: d.severity ?? "INFO", clientId: d.clientId ?? null },
      });
      created++;
    } else if (!e.resolvedAt && (e.title !== d.title || e.body !== (d.body ?? null) || e.severity !== (d.severity ?? "INFO"))) {
      await db.notification.update({ where: { id: e.id }, data: { title: d.title, body: d.body ?? null, severity: d.severity ?? "INFO", href: d.href ?? null } });
    }
  }
  if (!opts.keepStale) {
    const r = await db.notification.updateMany({
      where: { type, resolvedAt: null, dedupeKey: { notIn: keys.length ? keys : ["__none__"] } },
      data: { resolvedAt: new Date() },
    });
    resolved = r.count;
  }
  return { created, resolved, open: desired.length };
}
