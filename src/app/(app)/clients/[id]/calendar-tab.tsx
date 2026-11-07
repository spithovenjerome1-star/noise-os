import Link from "next/link";
import { CalendarDays, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { fmtDate, fmtMoment, maltaDateOf, plainOf, todayMalta } from "@/lib/dates";
import { EVENT_TYPE } from "@/lib/labels";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionTitle } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

type Item = { key: string; date: string; time?: string; title: string; type: keyof typeof EVENT_TYPE; href?: string; meta?: string };

export async function CalendarTab({ clientId }: { clientId: string }) {
  const today = todayMalta();
  const [events, deadlines] = await Promise.all([
    db.calendarEvent.findMany({ where: { clientId }, orderBy: { startsAt: "asc" }, take: 300 }),
    db.video.findMany({
      where: { clientId, deadline: { not: null }, stage: { category: { not: "DELIVERED" } } },
      select: { id: true, title: true, deadline: true, shootDate: true },
    }),
  ]);
  const items: Item[] = ([
    ...events.map((e) => ({
      key: e.id,
      date: maltaDateOf(e.startsAt),
      time: e.allDay ? "All day" : `${fmtMoment(e.startsAt, "HH:mm")}–${fmtMoment(e.endsAt, "HH:mm")}`,
      title: e.title,
      type: e.type,
      href: `/calendar?date=${maltaDateOf(e.startsAt)}`,
      meta: e.location ?? undefined,
    })),
    ...deadlines.map((v) => ({ key: `d-${v.id}`, date: plainOf(v.deadline)!, title: `${v.title}`, type: "EDIT_DEADLINE" as const, href: `/videos/${v.id}`, meta: "Delivery deadline" })),
  ] as Item[]).sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));

  const upcoming = items.filter((i) => i.date >= today);
  const past = items.filter((i) => i.date < today).reverse().slice(0, 20);

  if (!items.length)
    return (
      <EmptyState
        icon={CalendarDays}
        title="Nothing scheduled"
        description="Shoots, meetings and video deadlines for this client will show here."
        action={<Button variant="primary" asChild><Link href={`/calendar?new=shoot&client=${clientId}`}><Plus /> Schedule shoot</Link></Button>}
      />
    );

  const List = ({ list }: { list: Item[] }) => (
    <Card>
      <ul className="divide-y divide-border">
        {list.map((i) => (
          <li key={i.key}>
            <Link href={i.href ?? "#"} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60">
              <div className="w-14 shrink-0 text-center">
                <div className="text-[11px] uppercase text-subtle">{fmtDate(i.date, "EEE")}</div>
                <div className="tabular text-sm font-semibold">{fmtDate(i.date, "d MMM")}</div>
              </div>
              <span className={cn("size-2 shrink-0 rounded-full", EVENT_TYPE[i.type].dot)} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{i.title}</div>
                <div className="truncate text-xs text-muted">{[EVENT_TYPE[i.type].label, i.time, i.meta].filter(Boolean).join(" · ")}</div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button variant="primary" size="sm" asChild><Link href={`/calendar?new=shoot&client=${clientId}`}><Plus /> Schedule shoot</Link></Button>
      </div>
      <section>
        <SectionTitle>Upcoming</SectionTitle>
        {upcoming.length ? <List list={upcoming} /> : <p className="text-[13px] text-muted">Nothing upcoming.</p>}
      </section>
      {past.length > 0 && (
        <section>
          <SectionTitle>Past</SectionTitle>
          <List list={past} />
        </section>
      )}
    </div>
  );
}
