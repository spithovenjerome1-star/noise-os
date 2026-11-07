import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { can } from "@/lib/permissions";
import { todayMalta } from "@/lib/dates";
import { toCsv } from "@/server/csv";
import { CSV_EXPORTS } from "@/server/csv-exports";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ entity: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { entity } = await params;
  const exp = CSV_EXPORTS[entity];
  if (!exp) return NextResponse.json({ error: "Unknown export" }, { status: 404 });
  if (!can(user.role, "data:export") || (exp.finance && !can(user.role, "finance:view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const csv = toCsv(await exp.build());
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="noise-os-${entity}-${todayMalta()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
