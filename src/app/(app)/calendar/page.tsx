import { db } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { can } from "@/lib/permissions";
import { todayMalta, addDaysPlain, maltaLocalToUtc, plainOf, utcToMaltaLocalInput, fmtMoment, type PlainDate } from "@/lib/dates";
import { viewRange, maltaParts, daysIn, type CalView } from "@/lib/calendar";
import { paymentState } from "@/lib/domain/invoices";
import { formatMoney } from "@/lib/money";
import { CalendarView } from "./calendar-view";
import type { CalItem, Segment } from "./types";

export const metadata = { title: "Calendar" };

function segmentsFor(start: Date, end: Date, allDay: boolean, rangeStart: PlainDate, rangeEnd: PlainDate): Segment[] {
  const s = maltaParts(start);
  const e = maltaParts(end);
  if (allDay) {
    const lastDay = addDaysPlain(e.date, e.minutes === 0 ? -1 : 0);
    return daysIn(s.date, addDaysPlain(lastDay < s.date ? s.date : lastDay, 1))
      .filter((d) => d >= rangeStart && d < rangeEnd)
      .map((d) => ({ date: d, startMin: 0, endMin: 1440 }));
  }
  const endDate = e.minutes === 0 && e.date > s.date ? addDaysPlain(e.date, -1) : e.date;
  return daysIn(s.date, addDaysPlain(endDate, 1))
    .filter((d) => d >= rangeStart && d < rangeEnd)
    .map((d) => ({
      date: d,
      startMin: d === s.date ? s.minutes : 0,
      endMin: d === e.date ? Math.max(e.minutes, (d === s.date ? s.minutes : 0) + 15) : 1440,
    }));
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; new?: string; event?: string; client?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const view: CalView = sp.view === "week" || sp.view === "day" ? sp.view : "month";
  const today = todayMalta();
  let anchor = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  // Deep link to an event (e.g. from equipment or search): jump to its date.
  if (sp.event && !sp.date) {
    const ev = await db.calendarEvent.findUnique({ where: { id: sp.event }, select: { startsAt: true } });
    if (ev) anchor = maltaParts(ev.startsAt).date;
  }
  const range = viewRange(view, anchor);
  const from = maltaLocalToUtc(`${range.start}T00:00`);
  const to = maltaLocalToUtc(`${range.end}T00:00`);
  const finance = can(user.role, "finance:view");

  const [events, deadlines, invoices, clients, projects, videos, equipment] = await Promise.all([
    db.calendarEvent.findMany({
      where: { startsAt: { lt: to }, endsAt: { gt: from } },
      include: { client: { select: { name: true } }, equipment: { select: { equipmentId: true } } },
      orderBy: { startsAt: "asc" },
    }),
    db.video.findMany({
      where: { deadline: { gte: new Date(`${range.start}T00:00:00Z`), lt: new Date(`${range.end}T00:00:00Z`) }, stage: { category: { not: "DELIVERED" } } },
      select: { id: true, title: true, deadline: true, client: { select: { name: true } } },
    }),
    finance
      ? db.invoice.findMany({
          where: { status: "SENT", dueDate: { gte: new Date(`${range.start}T00:00:00Z`), lt: new Date(`${range.end}T00:00:00Z`) } },
          select: { id: true, number: true, totalCents: true, dueDate: true, status: true, client: { select: { name: true } }, payments: { select: { amountCents: true } } },
        })
      : [],
    db.client.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.project.findMany({ where: { status: { in: ["ACTIVE", "ON_HOLD"] } }, orderBy: { name: "asc" }, select: { id: true, name: true, clientId: true } }),
    db.video.findMany({ where: { stage: { category: { not: "DELIVERED" } } }, orderBy: { updatedAt: "desc" }, take: 400, select: { id: true, title: true, clientId: true } }),
    db.equipment.findMany({ where: { status: { not: "RETIRED" } }, orderBy: [{ category: "asc" }, { name: "asc" }], select: { id: true, name: true, category: true, status: true } }),
  ]);

  const items: CalItem[] = [];
  for (const e of events) {
    const segments = segmentsFor(e.startsAt, e.endsAt, e.allDay, range.start, range.end);
    if (!segments.length) continue;
    const endInclusive = e.allDay ? plainOf(new Date(maltaParts(new Date(e.endsAt.getTime() - 1)).date + "T00:00:00Z"))! : maltaParts(e.endsAt).date;
    items.push({
      key: `e-${e.id}`,
      kind: "event",
      typeKey: e.type,
      title: e.title,
      subtitle: [e.client?.name, e.location].filter(Boolean).join(" · ") || undefined,
      allDay: e.allDay,
      segments,
      timeLabel: e.allDay ? "All day" : `${fmtMoment(e.startsAt, "HH:mm")}–${fmtMoment(e.endsAt, "HH:mm")}`,
      event: {
        id: e.id,
        title: e.title,
        type: e.type,
        allDay: e.allDay,
        startsLocal: utcToMaltaLocalInput(e.startsAt),
        endsLocal: utcToMaltaLocalInput(e.endsAt),
        startDate: maltaParts(e.startsAt).date,
        endDate: endInclusive,
        location: e.location ?? "",
        clientId: e.clientId ?? "",
        projectId: e.projectId ?? "",
        videoId: e.videoId ?? "",
        notes: e.notes ?? "",
        equipmentIds: e.equipment.map((x) => x.equipmentId),
      },
    });
  }
  for (const v of deadlines) {
    const d = plainOf(v.deadline)!;
    items.push({ key: `d-${v.id}`, kind: "deadline", typeKey: "EDIT_DEADLINE", title: v.title, subtitle: `Editing deadline · ${v.client.name}`, allDay: true, segments: [{ date: d, startMin: 0, endMin: 1440 }], timeLabel: "Deadline", href: `/videos/${v.id}` });
  }
  for (const i of invoices) {
    const due = plainOf(i.dueDate)!;
    const st = paymentState({ status: i.status, totalCents: i.totalCents, dueDate: due }, i.payments, today);
    if (st.balanceCents <= 0) continue;
    items.push({ key: `i-${i.id}`, kind: "invoice", typeKey: "INVOICE_DUE", title: `${i.number} due`, subtitle: `${i.client.name} · ${formatMoney(st.balanceCents)} outstanding`, allDay: true, segments: [{ date: due, startMin: 0, endMin: 1440 }], timeLabel: "Invoice due", href: `/invoices/${i.id}` });
  }

  return (
    <CalendarView
      view={view}
      anchor={anchor}
      today={today}
      range={range}
      items={items}
      showInvoices={finance}
      canEdit={can(user.role, "production:edit")}
      initialNew={sp.new ? (sp.new === "shoot" ? "SHOOT" : "OTHER") : null}
      initialClientId={sp.client ?? null}
      initialEventId={sp.event ?? null}
      options={{
        clients: clients.map((c) => ({ value: c.id, label: c.name })),
        projects: projects.map((p) => ({ value: p.id, label: p.name, clientId: p.clientId })),
        videos: videos.map((v) => ({ value: v.id, label: v.title, clientId: v.clientId })),
        equipment: equipment.map((g) => ({ value: g.id, label: `${g.name}${g.status === "IN_REPAIR" ? " (in repair)" : ""}`, clientId: g.category })),
      }}
    />
  );
}
