"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/misc";
import { EVENT_TYPE } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { daysIn, layoutColumns, shiftAnchor, type CalView } from "@/lib/calendar";
import type { CalItem, CalOptions, EventPayload } from "./types";
import { EventDialog, type DialogState } from "./event-dialog";

const HOUR_PX = 44;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarView({
  view,
  anchor,
  today,
  range,
  items,
  options,
  showInvoices,
  canEdit,
  initialNew,
  initialClientId,
  initialEventId,
}: {
  view: CalView;
  anchor: string;
  today: string;
  range: { start: string; end: string };
  items: CalItem[];
  options: CalOptions;
  showInvoices: boolean;
  canEdit: boolean;
  initialNew: "SHOOT" | "OTHER" | null;
  initialClientId?: string | null;
  initialEventId: string | null;
}) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<DialogState | null>(() => {
    if (initialEventId) {
      const ev = items.find((i) => i.event?.id === initialEventId)?.event;
      if (ev) return { mode: "edit", event: ev };
    }
    if (initialNew && canEdit) return { mode: "new", type: initialNew === "SHOOT" ? "SHOOT" : "MEETING", date: today, startMin: 9 * 60, clientId: initialClientId ?? undefined };
    return null;
  });

  const href = (v: CalView, d: string) => `/calendar?view=${v}&date=${d}`;
  const label =
    view === "month"
      ? format(parseISO(anchor), "MMMM yyyy")
      : view === "week"
        ? `${format(parseISO(range.start), "d MMM")} – ${format(parseISO(daysIn(range.start, range.end).at(-1)!), "d MMM yyyy")}`
        : format(parseISO(anchor), "EEEE d MMMM yyyy");

  const byDay = React.useMemo(() => {
    const m = new Map<string, { item: CalItem; startMin: number; endMin: number }[]>();
    for (const it of items)
      for (const s of it.segments) {
        const arr = m.get(s.date) ?? [];
        arr.push({ item: it, startMin: s.startMin, endMin: s.endMin });
        m.set(s.date, arr);
      }
    for (const arr of m.values()) arr.sort((a, b) => Number(b.item.allDay) - Number(a.item.allDay) || a.startMin - b.startMin);
    return m;
  }, [items]);

  const openItem = (it: CalItem) => {
    if (it.event) {
      if (canEdit) setDialog({ mode: "edit", event: it.event });
    } else if (it.href) router.push(it.href);
  };
  const createAt = (date: string, startMin = 9 * 60) => canEdit && setDialog({ mode: "new", type: "SHOOT", date, startMin });

  const legend = (Object.keys(EVENT_TYPE) as (keyof typeof EVENT_TYPE)[]).filter((k) => showInvoices || k !== "INVOICE_DUE");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{label}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center">
            <Button variant="ghost" size="icon" asChild aria-label="Previous">
              <Link href={href(view, shiftAnchor(view, anchor, -1))} scroll={false}>
                <ChevronLeft />
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href={href(view, today)} scroll={false}>
                Today
              </Link>
            </Button>
            <Button variant="ghost" size="icon" asChild aria-label="Next">
              <Link href={href(view, shiftAnchor(view, anchor, 1))} scroll={false}>
                <ChevronRight />
              </Link>
            </Button>
          </div>
          <Segmented
            active={view}
            items={[
              { key: "month", label: "Month", href: href("month", anchor) },
              { key: "week", label: "Week", href: href("week", anchor) },
              { key: "day", label: "Day", href: href("day", anchor) },
            ]}
          />
          {canEdit && (
            <Button variant="primary" size="sm" onClick={() => setDialog({ mode: "new", type: "SHOOT", date: view === "month" ? today : anchor, startMin: 9 * 60 })}>
              <Plus /> New event
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {legend.map((k) => (
          <span key={k} className="flex items-center gap-1.5 text-xs text-muted">
            <span className={cn("size-2 rounded-full", EVENT_TYPE[k].dot)} /> {EVENT_TYPE[k].label}
          </span>
        ))}
      </div>

      {view === "month" && (
        <>
          <MonthGrid range={range} anchor={anchor} today={today} byDay={byDay} onItem={openItem} onDay={createAt} dayHref={(d) => href("day", d)} />
          <Agenda className="md:hidden" days={daysIn(range.start, range.end).filter((d) => d.slice(0, 7) === anchor.slice(0, 7))} byDay={byDay} today={today} onItem={openItem} />
        </>
      )}
      {view === "week" && (
        <>
          <TimeGrid days={daysIn(range.start, range.end)} today={today} byDay={byDay} onItem={openItem} onSlot={createAt} className="hidden md:flex" dayHref={(d) => href("day", d)} />
          <Agenda className="md:hidden" days={daysIn(range.start, range.end)} byDay={byDay} today={today} onItem={openItem} />
        </>
      )}
      {view === "day" && <TimeGrid days={[anchor]} today={today} byDay={byDay} onItem={openItem} onSlot={createAt} dayHref={(d) => href("day", d)} />}

      {dialog && <EventDialog state={dialog} options={options} onClose={() => setDialog(null)} />}
    </div>
  );
}

type DayMap = Map<string, { item: CalItem; startMin: number; endMin: number }[]>;

function Chip({ item, onClick, compact }: { item: CalItem; onClick: () => void; compact?: boolean }) {
  const t = EVENT_TYPE[item.typeKey];
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={[item.title, item.subtitle, item.timeLabel].filter(Boolean).join(" · ")}
      className={cn("flex w-full min-w-0 items-center gap-1.5 rounded px-1.5 text-left text-[11px] leading-5 transition-opacity hover:opacity-80", item.allDay ? t.chip : "text-fg hover:bg-surface-2")}
    >
      {!item.allDay && <span className={cn("size-1.5 shrink-0 rounded-full", t.dot)} />}
      {!item.allDay && !compact && item.event && <span className="tabular shrink-0 text-subtle">{item.event.startsLocal.slice(11, 16)}</span>}
      <span className="truncate font-medium">{item.title}</span>
    </button>
  );
}

function MonthGrid({ range, anchor, today, byDay, onItem, onDay, dayHref }: { range: { start: string; end: string }; anchor: string; today: string; byDay: DayMap; onItem: (i: CalItem) => void; onDay: (d: string) => void; dayHref: (d: string) => string }) {
  const days = daysIn(range.start, range.end);
  const month = anchor.slice(0, 7);
  return (
    <div className="hidden overflow-hidden rounded-xl border border-border bg-surface shadow-card md:block">
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-1.5 text-[11px] font-medium text-subtle">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6">
        {days.map((d, i) => {
          const list = byDay.get(d) ?? [];
          const inMonth = d.slice(0, 7) === month;
          return (
            <div
              key={d}
              onClick={() => onDay(d)}
              className={cn("group min-h-28 cursor-pointer border-border p-1 transition-colors hover:bg-surface-2/50", i % 7 !== 6 && "border-r", i < 35 && "border-b", !inMonth && "bg-surface-2/40")}
            >
              <div className="mb-0.5 flex items-center justify-between px-1">
                <Link
                  href={dayHref(d)}
                  onClick={(e) => e.stopPropagation()}
                  className={cn("tabular flex size-6 items-center justify-center rounded-full text-xs hover:bg-surface-3", !inMonth && "text-subtle", d === today && "bg-accent font-semibold text-white hover:bg-accent")}
                >
                  {Number(d.slice(8))}
                </Link>
                <Plus className="size-3.5 text-subtle opacity-0 group-hover:opacity-100" />
              </div>
              <div className="flex flex-col gap-px">
                {list.slice(0, 3).map(({ item }) => (
                  <Chip key={item.key + d} item={item} onClick={() => onItem(item)} />
                ))}
                {list.length > 3 && (
                  <Link href={dayHref(d)} onClick={(e) => e.stopPropagation()} className="px-1.5 text-[11px] text-muted hover:text-fg">
                    +{list.length - 3} more
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Agenda({ days, byDay, today, onItem, className }: { days: string[]; byDay: DayMap; today: string; onItem: (i: CalItem) => void; className?: string }) {
  const withItems = days.filter((d) => byDay.get(d)?.length);
  if (!withItems.length) return <EmptyState className={className} icon={CalendarDays} title="Nothing scheduled" description="Shoots, meetings, deadlines and invoice due dates will show here." />;
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {withItems.map((d) => (
        <section key={d}>
          <h3 className={cn("mb-1.5 text-xs font-medium text-subtle", d === today && "text-accent")}>{d === today ? "Today · " : ""}{format(parseISO(d), "EEEE d MMMM")}</h3>
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {byDay.get(d)!.map(({ item }) => {
              const t = EVENT_TYPE[item.typeKey];
              return (
                <button key={item.key} type="button" onClick={() => onItem(item)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2/60">
                  <span className={cn("h-8 w-1 shrink-0 rounded-full", t.dot)} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{item.title}</div>
                    <div className="truncate text-xs text-muted">{[item.timeLabel, item.subtitle].filter(Boolean).join(" · ")}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function TimeGrid({ days, today, byDay, onItem, onSlot, className, dayHref }: { days: string[]; today: string; byDay: DayMap; onItem: (i: CalItem) => void; onSlot: (d: string, startMin: number) => void; className?: string; dayHref: (d: string) => string }) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_PX - 10;
  }, []);
  const [nowMin, setNowMin] = React.useState<number | null>(null);
  React.useEffect(() => {
    const tick = () => {
      const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Malta", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).split(":");
      setNowMin(Number(p[0]) * 60 + Number(p[1]));
    };
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);
  const cols = `56px repeat(${days.length}, minmax(0, 1fr))`;
  const hasAllDay = days.some((d) => byDay.get(d)?.some((x) => x.item.allDay));
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-card", className)}>
      <div className="grid border-b border-border" style={{ gridTemplateColumns: cols }}>
        <div />
        {days.map((d) => (
          <Link key={d} href={dayHref(d)} className="border-l border-border px-2 py-1.5 text-center hover:bg-surface-2/50">
            <div className="text-[11px] text-subtle">{format(parseISO(d), "EEE")}</div>
            <div className={cn("tabular mx-auto flex size-7 items-center justify-center rounded-full text-sm font-medium", d === today && "bg-accent text-white")}>{Number(d.slice(8))}</div>
          </Link>
        ))}
      </div>
      {hasAllDay && (
        <div className="grid border-b border-border" style={{ gridTemplateColumns: cols }}>
          <div className="px-2 py-1 text-right text-[10px] text-subtle">all-day</div>
          {days.map((d) => (
            <div key={d} className="flex flex-col gap-px border-l border-border p-1">
              {(byDay.get(d) ?? [])
                .filter((x) => x.item.allDay)
                .map(({ item }) => (
                  <Chip key={item.key} item={item} onClick={() => onItem(item)} compact />
                ))}
            </div>
          ))}
        </div>
      )}
      <div ref={scrollRef} className="relative max-h-[68vh] overflow-y-auto scrollbar-thin">
        <div className="grid" style={{ gridTemplateColumns: cols, height: 24 * HOUR_PX }}>
          <div className="relative">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="tabular absolute right-2 -translate-y-1/2 text-[10px] text-subtle" style={{ top: h * HOUR_PX }}>
                {h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
              </div>
            ))}
          </div>
          {days.map((d) => {
            const timed = layoutColumns(
              (byDay.get(d) ?? []).filter((x) => !x.item.allDay).map((x) => ({ id: x.item.key, startMin: x.startMin, endMin: x.endMin, item: x.item })),
            );
            return (
              <div
                key={d}
                className="relative cursor-pointer border-l border-border"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const min = Math.floor(((e.clientY - rect.top) / HOUR_PX) * 2) * 30;
                  onSlot(d, Math.max(0, Math.min(23 * 60 + 30, min)));
                }}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="absolute inset-x-0 border-t border-border/70" style={{ top: h * HOUR_PX }} />
                ))}
                {d === today && nowMin !== null && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: (nowMin / 60) * HOUR_PX }}>
                    <span className="-ml-1 size-2 rounded-full bg-accent" />
                    <span className="h-px flex-1 bg-accent" />
                  </div>
                )}
                {timed.map((t) => {
                  const ty = EVENT_TYPE[t.item.typeKey];
                  const top = (t.startMin / 60) * HOUR_PX;
                  const height = Math.max(20, ((t.endMin - t.startMin) / 60) * HOUR_PX - 2);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onItem(t.item);
                      }}
                      className={cn("absolute overflow-hidden rounded-md border-l-2 px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-card transition-opacity hover:opacity-90", ty.chip)}
                      style={{ top, height, left: `calc(${(t.col / t.cols) * 100}% + 2px)`, width: `calc(${100 / t.cols}% - 4px)`, borderLeftColor: "currentColor" }}
                    >
                      <div className="truncate font-medium">{t.item.title}</div>
                      {height > 30 && <div className="truncate opacity-80">{[t.item.timeLabel, t.item.subtitle].filter(Boolean).join(" · ")}</div>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export type { EventPayload };
