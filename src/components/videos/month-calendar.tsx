import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, format, parseISO } from "date-fns";
import { addDaysPlain, startOfMonthPlain, endOfMonthPlain, type PlainDate } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VideoDTO } from "@/server/videos/queries";

type Entry = { id: string; title: string; kind: "deadline" | "shoot"; time?: string; late: boolean };

/** Month grid (Monday start) of video deadlines and shoot dates. */
export function VideoMonthCalendar({ month, videos, today, hrefFor }: { month: string; videos: VideoDTO[]; today: PlainDate; hrefFor: (month: string) => string }) {
  const first = `${month}-01`;
  const last = endOfMonthPlain(first);
  const dow = (parseISO(first).getDay() + 6) % 7; // 0 = Monday
  const gridStart = addDaysPlain(first, -dow);
  const days: PlainDate[] = [];
  for (let d = gridStart; days.length < 42; d = addDaysPlain(d, 1)) {
    days.push(d);
    if (days.length % 7 === 0 && d >= last) break;
  }
  const byDay = new Map<string, Entry[]>();
  const push = (d: string, e: Entry) => byDay.set(d, [...(byDay.get(d) ?? []), e]);
  for (const v of videos) {
    if (v.deadline) push(v.deadline, { id: v.id, title: v.title, kind: "deadline", late: v.category !== "DELIVERED" && v.deadline < today });
    if (v.shootLocal) push(v.shootLocal.slice(0, 10), { id: v.id, title: v.title, kind: "shoot", time: v.shootLocal.slice(11), late: false });
  }
  const prev = format(addMonths(parseISO(first), -1), "yyyy-MM");
  const next = format(addMonths(parseISO(first), 1), "yyyy-MM");

  return (
    <div className="rounded-xl border border-border bg-surface shadow-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold tracking-tight">{format(parseISO(first), "MMMM yyyy")}</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" asChild aria-label="Previous month"><Link href={hrefFor(prev)} scroll={false}><ChevronLeft /></Link></Button>
          <Button variant="ghost" size="sm" asChild><Link href={hrefFor(today.slice(0, 7))} scroll={false}>Today</Link></Button>
          <Button variant="ghost" size="icon-sm" asChild aria-label="Next month"><Link href={hrefFor(next)} scroll={false}><ChevronRight /></Link></Button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-border text-[11px] font-medium text-subtle">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="px-2 py-1.5">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const entries = byDay.get(d) ?? [];
          const inMonth = d >= startOfMonthPlain(first) && d <= last;
          return (
            <div key={d} className={cn("min-h-24 border-b border-border p-1.5 sm:min-h-28", i % 7 !== 6 && "border-r", !inMonth && "bg-surface-2/40")}>
              <div className={cn("mb-1 flex size-5 items-center justify-center rounded-full text-[11px] tabular", inMonth ? "text-muted" : "text-subtle", d === today && "bg-fg font-semibold text-bg")}>{Number(d.slice(8))}</div>
              <div className="flex flex-col gap-0.5">
                {entries.slice(0, 4).map((e) => (
                  <Link
                    key={e.kind + e.id}
                    href={`/videos/${e.id}`}
                    title={`${e.kind === "shoot" ? "Shoot" : "Deadline"}: ${e.title}`}
                    className={cn(
                      "truncate rounded px-1 py-0.5 text-[11px] leading-tight hover:opacity-80",
                      e.kind === "shoot" ? "bg-accent/10 text-accent" : e.late ? "bg-danger-bg text-danger" : "bg-warning-bg text-warning",
                    )}
                  >
                    {e.time ? `${e.time} ` : ""}{e.title}
                  </Link>
                ))}
                {entries.length > 4 && <span className="px-1 text-[10px] text-subtle">+{entries.length - 4} more</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 px-4 py-2 text-[11px] text-subtle">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent" />Shoot</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-warning" />Delivery deadline</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-danger" />Overdue</span>
      </div>
    </div>
  );
}
