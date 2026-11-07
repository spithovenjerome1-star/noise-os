"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Package } from "lucide-react";
import { moveVideo } from "@/server/videos/actions";
import type { VideoDTO } from "@/server/videos/queries";
import { positionBetween } from "@/lib/domain/tasks";
import { Avatar } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { DeadlineChip, PriorityMark, StageDot } from "./video-bits";
import { cn } from "@/lib/utils";

type Stage = { id: string; name: string; color: string; category: VideoDTO["category"] };
type Columns = Record<string, VideoDTO[]>;

function group(stages: Stage[], videos: VideoDTO[]): Columns {
  const cols: Columns = Object.fromEntries(stages.map((s) => [s.id, [] as VideoDTO[]]));
  for (const v of videos) (cols[v.stageId] ??= []).push(v);
  for (const k of Object.keys(cols)) cols[k]!.sort((a, b) => a.position - b.position);
  return cols;
}

export function VideoBoard({ stages, videos, today, warningDays, onAdd }: { stages: Stage[]; videos: VideoDTO[]; today: string; warningDays: number; onAdd?: (stageId: string) => void }) {
  const router = useRouter();
  const [cols, setCols] = React.useState<Columns>(() => group(stages, videos));
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const origin = React.useRef<{ stageId: string; index: number } | null>(null);
  React.useEffect(() => setCols(group(stages, videos)), [stages, videos]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findCol = (id: string) => (id in cols ? id : Object.keys(cols).find((k) => cols[k]!.some((v) => v.id === id)));
  const active = activeId ? Object.values(cols).flat().find((v) => v.id === activeId) : null;
  const stageById = Object.fromEntries(stages.map((s) => [s.id, s]));

  function onStart(e: DragStartEvent) {
    const id = String(e.active.id);
    setActiveId(id);
    const col = findCol(id)!;
    origin.current = { stageId: col, index: cols[col]!.findIndex((v) => v.id === id) };
  }

  function onOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const from = findCol(String(active.id));
    const to = findCol(String(over.id));
    if (!from || !to || from === to) return;
    setCols((prev) => {
      const item = prev[from]!.find((v) => v.id === active.id)!;
      const target = prev[to]!.filter((v) => v.id !== active.id);
      const overIndex = target.findIndex((v) => v.id === over.id);
      const idx = overIndex >= 0 ? overIndex : target.length;
      target.splice(idx, 0, { ...item, stageId: to });
      return { ...prev, [from]: prev[from]!.filter((v) => v.id !== active.id), [to]: target };
    });
  }

  async function onEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    const id = String(active.id);
    const col = findCol(id);
    if (!over || !col) return setCols(group(stages, videos));
    let list = cols[col]!;
    const oldIndex = list.findIndex((v) => v.id === id);
    const overIndex = over.id in cols ? list.length - 1 : list.findIndex((v) => v.id === over.id);
    if (overIndex >= 0 && overIndex !== oldIndex) {
      list = [...list];
      const [m] = list.splice(oldIndex, 1);
      list.splice(overIndex, 0, m!);
    }
    const index = list.findIndex((v) => v.id === id);
    if (origin.current && origin.current.stageId === col && origin.current.index === index) return;
    const position = positionBetween(list[index - 1]?.position ?? null, list[index + 1]?.position ?? null);
    const next = list.map((v) => (v.id === id ? { ...v, position, stageId: col, category: stageById[col]!.category } : v));
    setCols((prev) => ({ ...prev, [col]: next }));
    const r = await moveVideo(id, col, position);
    if (!r.ok) {
      toast.error(r.error);
      setCols(group(stages, videos));
    } else {
      if (origin.current?.stageId !== col) toast.success(`Moved to ${stageById[col]!.name}`);
      router.refresh();
    }
  }

  return (
    <DndContext id="video-board" sensors={sensors} collisionDetection={closestCorners} onDragStart={onStart} onDragOver={onOver} onDragEnd={onEnd} onDragCancel={() => { setActiveId(null); setCols(group(stages, videos)); }}>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 scrollbar-thin sm:-mx-6 sm:px-6">
        {stages.map((s) => (
          <Column key={s.id} stage={s} items={cols[s.id] ?? []} today={today} warningDays={warningDays} onAdd={onAdd} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)" }}>
        {active ? <Card video={active} today={today} warningDays={warningDays} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({ stage, items, today, warningDays, onAdd }: { stage: Stage; items: VideoDTO[]; today: string; warningDays: number; onAdd?: (stageId: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <section className="flex w-72 shrink-0 flex-col" aria-label={stage.name}>
      <header className="mb-2 flex h-7 items-center gap-2 px-1">
        <StageDot color={stage.color} />
        <h2 className="truncate text-[13px] font-medium">{stage.name}</h2>
        <span className="tabular text-xs text-subtle">{items.length}</span>
        {onAdd && (
          <button type="button" onClick={() => onAdd(stage.id)} className="ml-auto rounded p-1 text-subtle hover:bg-surface-2 hover:text-fg" aria-label={`Add video to ${stage.name}`}>
            <Plus className="size-3.5" />
          </button>
        )}
      </header>
      <div ref={setNodeRef} className={cn("flex min-h-24 flex-1 flex-col gap-2 rounded-xl bg-surface-2/60 p-1.5 transition-colors", isOver && "bg-surface-3/70")}>
        <SortableContext items={items.map((v) => v.id)} strategy={verticalListSortingStrategy}>
          {items.map((v) => (
            <SortableCard key={v.id} video={v} today={today} warningDays={warningDays} />
          ))}
        </SortableContext>
        {items.length === 0 && <div className="flex flex-1 items-center justify-center py-6 text-xs text-subtle">Drop here</div>}
      </div>
    </section>
  );
}

function SortableCard(props: { video: VideoDTO; today: string; warningDays: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.video.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn(isDragging && "opacity-40")} {...attributes} {...listeners}>
      <Card {...props} />
    </div>
  );
}

function Card({ video: v, today, warningDays, overlay }: { video: VideoDTO; today: string; warningDays: number; overlay?: boolean }) {
  return (
    <Link
      href={`/videos/${v.id}`}
      draggable={false}
      className={cn(
        "block rounded-lg border border-border bg-surface p-2.5 shadow-card transition-[box-shadow,border-color] hover:border-border-strong",
        overlay && "rotate-[1.5deg] shadow-pop",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-[13px] font-medium leading-snug">{v.title}</p>
        {v.assigneeName && <Avatar name={v.assigneeName} className="size-5 text-[9px]" />}
      </div>
      <p className="mt-0.5 truncate text-xs text-muted">{v.clientName}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <DeadlineChip deadline={v.deadline} category={v.category} today={today} warningDays={warningDays} />
        <PriorityMark priority={v.priority} />
        {v.isExtra ? (
          <Badge tone="accent">Extra</Badge>
        ) : v.packageName ? (
          <Badge>
            <Package className="size-3" />
            <span className="max-w-24 truncate">{v.packageName}</span>
          </Badge>
        ) : null}
      </div>
    </Link>
  );
}
