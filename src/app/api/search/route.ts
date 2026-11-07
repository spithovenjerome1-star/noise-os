import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/server/auth";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });
  const ci = { contains: q, mode: "insensitive" as const };
  const finance = can(user.role, "finance:view");
  const take = 6;

  const [clients, videos, scripts, tasks, projects, invoices, expenses, bookings] = await Promise.all([
    db.client.findMany({ where: { OR: [{ name: ci }, { companyName: ci }, { contactPerson: ci }, { email: ci }] }, take, select: { id: true, name: true, companyName: true, archivedAt: true } }),
    db.video.findMany({ where: { OR: [{ title: ci }, { description: ci }] }, take, select: { id: true, title: true, client: { select: { name: true } } } }),
    db.script.findMany({ where: { OR: [{ title: ci }, { hook: ci }, { mainContent: ci }] }, take, select: { id: true, title: true, client: { select: { name: true } } } }),
    db.task.findMany({ where: { OR: [{ title: ci }, { description: ci }] }, take, select: { id: true, title: true, status: true } }),
    db.project.findMany({ where: { name: ci }, take, select: { id: true, name: true, clientId: true, client: { select: { name: true } } } }),
    finance
      ? db.invoice.findMany({ where: { OR: [{ number: ci }, { description: ci }, { client: { name: ci } }] }, take, select: { id: true, number: true, totalCents: true, client: { select: { name: true } } } })
      : [],
    finance
      ? db.expense.findMany({ where: { OR: [{ description: ci }, { vendor: ci }] }, take, select: { id: true, description: true, amountCents: true, vendor: true } })
      : [],
    db.bookingRequest.findMany({ where: { OR: [{ name: ci }, { email: ci }, { company: ci }] }, take, select: { id: true, name: true, company: true } }),
  ]);

  const results = [
    ...clients.map((c) => ({ type: "client", id: c.id, title: c.name, subtitle: c.archivedAt ? "Archived" : (c.companyName ?? undefined), href: `/clients/${c.id}` })),
    ...videos.map((v) => ({ type: "video", id: v.id, title: v.title, subtitle: v.client.name, href: `/videos/${v.id}` })),
    ...scripts.map((s) => ({ type: "script", id: s.id, title: s.title, subtitle: s.client.name, href: `/scripts/${s.id}` })),
    ...tasks.map((t) => ({ type: "task", id: t.id, title: t.title, subtitle: t.status === "DONE" ? "Done" : undefined, href: `/tasks?task=${t.id}` })),
    ...projects.map((p) => ({ type: "project", id: p.id, title: p.name, subtitle: p.client.name, href: `/clients/${p.clientId}?tab=overview` })),
    ...invoices.map((i) => ({ type: "invoice", id: i.id, title: i.number, subtitle: `${i.client.name} · ${formatMoney(i.totalCents)}`, href: `/invoices/${i.id}` })),
    ...expenses.map((e) => ({ type: "expense", id: e.id, title: e.description, subtitle: `${e.vendor ?? ""} ${formatMoney(e.amountCents)}`.trim(), href: `/expenses?expense=${e.id}` })),
    ...bookings.map((b) => ({ type: "booking", id: b.id, title: b.name, subtitle: b.company ?? undefined, href: `/bookings?booking=${b.id}` })),
  ];
  return NextResponse.json({ results });
}
