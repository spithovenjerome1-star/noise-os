import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveShareToken } from "@/server/share-links";
import { linkCanAccessClientResource } from "@/lib/permissions";
import { getFile } from "@/server/storage";

// Portal-scoped download: only files explicitly marked visible to the client, for that client only.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const link = await resolveShareToken(token);
  const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!link) return notFound();
  const a = await db.attachment.findUnique({ where: { id } });
  if (!a || !a.clientId || !a.visibleToClient || a.expenseId) return notFound();
  if (!linkCanAccessClientResource(link, { clientId: a.clientId })) return notFound();
  const buf = await getFile(a.storageKey);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(a.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}
