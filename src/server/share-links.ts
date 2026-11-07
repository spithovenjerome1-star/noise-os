import "server-only";
// Client-facing share links. Tokens are random 32-byte values shown once; only their
// sha256 hash is stored. Links are scoped (whole client portal, or a single script),
// can expire, and can be revoked at any time.
import type { ShareScope } from "@prisma/client";
import { db } from "@/lib/db";
import { linkIsActive } from "@/lib/permissions";
import { newToken, sha256 } from "./auth";

export function portalUrl(token: string) {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/portal/${token}`;
}

export async function createShareLink(opts: {
  scope: ShareScope;
  clientId: string;
  scriptId?: string | null;
  label?: string | null;
  expiresInDays?: number | null;
  createdById?: string | null;
}) {
  const token = newToken();
  const expiresAt = opts.expiresInDays ? new Date(Date.now() + opts.expiresInDays * 86400_000) : null;
  const link = await db.shareLink.create({
    data: {
      tokenHash: sha256(token),
      scope: opts.scope,
      clientId: opts.clientId,
      scriptId: opts.scope === "SCRIPT" ? opts.scriptId ?? null : null,
      label: opts.label ?? null,
      expiresAt,
      createdById: opts.createdById ?? null,
    },
  });
  return { link, token, url: portalUrl(token) };
}

export async function revokeShareLink(id: string) {
  return db.shareLink.update({ where: { id }, data: { revokedAt: new Date() } });
}

/** Resolve a raw token from a URL. Returns null if unknown, revoked or expired. */
export async function resolveShareToken(token: string) {
  if (!token || token.length < 20 || token.length > 100) return null;
  const link = await db.shareLink.findUnique({ where: { tokenHash: sha256(token) }, include: { client: { select: { id: true, name: true, archivedAt: true } } } });
  if (!link || !linkIsActive(link)) return null;
  // Usage tracking (best effort)
  db.shareLink.update({ where: { id: link.id }, data: { lastUsedAt: new Date(), useCount: { increment: 1 } } }).catch(() => {});
  return link;
}
