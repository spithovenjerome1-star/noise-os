import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/server/auth";
import { can } from "@/lib/permissions";
import { getFile } from "@/server/storage";

// Authenticated file download. Finance attachments (receipts, invoice PDFs) require finance access.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const a = await db.attachment.findUnique({ where: { id } });
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ((a.invoiceId || a.expenseId) && !can(user.role, "finance:view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const buf = await getFile(a.storageKey);
  const download = new URL(req.url).searchParams.has("download");
  const inlineSafe = /^(image\/(png|jpeg|webp)|application\/pdf|text\/plain)$/.test(a.mimeType);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": inlineSafe ? a.mimeType : "application/octet-stream",
      "Content-Disposition": `${download || !inlineSafe ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(a.fileName)}`,
      "Cache-Control": "private, max-age=0, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
