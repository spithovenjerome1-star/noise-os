import { Badge } from "@/components/ui/badge";
import { DEADLINE_STATE, PRIORITY, STAGE_COLORS } from "@/lib/labels";
import { deadlineState } from "@/lib/domain/deadlines";
import { relativeDays, fmtDate } from "@/lib/dates";
import type { StageCategory, Priority } from "@prisma/client";
import { cn } from "@/lib/utils";
import { CalendarClock } from "lucide-react";

export function DeadlineChip({ deadline, category, today, warningDays, className }: { deadline: string | null; category: StageCategory; today: string; warningDays: number; className?: string }) {
  const state = deadlineState(deadline, category, today, warningDays);
  if (state === "none" || (state === "done" && !deadline)) return null;
  if (state === "done") return <span className={cn("text-[11px] text-subtle", className)}>Due {fmtDate(deadline, "d MMM")}</span>;
  const tone = DEADLINE_STATE[state].tone;
  return (
    <Badge tone={tone === "neutral" ? "neutral" : tone} className={className}>
      <CalendarClock className="size-3" />
      {state === "overdue" ? `Overdue · ${relativeDays(deadline!, today)}` : relativeDays(deadline!, today)}
    </Badge>
  );
}

export function PriorityMark({ priority, showNormal }: { priority: Priority; showNormal?: boolean }) {
  if (priority === "NORMAL" && !showNormal) return null;
  if (priority === "LOW" && !showNormal) return null;
  return <Badge tone={PRIORITY[priority].tone}>{PRIORITY[priority].label}</Badge>;
}

export function StageDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", STAGE_COLORS[color] ?? "bg-zinc-400", className)} />;
}
