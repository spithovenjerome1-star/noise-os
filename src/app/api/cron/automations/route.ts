import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runAutomations } from "@/server/automations/run";

// Production scheduler entry point (e.g. Vercel Cron, GitHub Actions, system cron):
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://os.noise.mt/api/cron/automations
export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const given = Buffer.from(header.replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await runAutomations("cron");
  return NextResponse.json({ ok: r.errors.length === 0, runId: r.id, errors: r.errors, result: r.result });
}

export const GET = handle;
export const POST = handle;
