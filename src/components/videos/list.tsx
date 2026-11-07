"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, X } from "lucide-react";
import { batchUpdateVideos, deleteVideos } from "@/server/videos/actions";
import type { VideoDTO } from "@/server/videos/queries";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, Input } from "@/components/ui/input";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { DeadlineChip, PriorityMark, StageDot } from "./video-bits";
import { PRIORITY } from "@/lib/labels";
import { fmtDate } from "@/lib/dates";
import { Clapperboard } from "lucide-react";

type Opt = { value: string; label: string };

export function VideoList({ videos, stages, users, today, warningDays }: { videos: VideoDTO[]; stages: { id: string; name: string; color: string }[]; users: Opt[]; today: string; warningDays: number }) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [pending, start] = React.useTransition();
  const [deadline, setDeadline] = React.useState("");
  React.useEffect(() => setSelected((s) => new Set([...s].filter((id) => videos.some((v) => v.id === id)))), [videos]);

  const ids = [...selected];
  const all = videos.length > 0 && selected.size === videos.length;
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  function run(input: Parameters<typeof batchUpdateVideos>[0]) {
    start(async () => {
      const r = await batchUpdateVideos(input);
      if (r.ok) { toast.success(r.message ?? "Updated"); router.refresh(); }
      else toast.error(r.error);
    });
  }

  if (!videos.length) return <EmptyState icon={Clapperboard} title="No videos match" description="Adjust the filters or create a new video." />;

  return (
    <div className="relative">
      {selected.size > 0 && (
        <div className="sticky top-14 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2 shadow-pop animate-pop">
          <span className="tabular px-1 text-[13px] font-medium">{selected.size} selected</span>
          <Select aria-label="Move to stage" className="h-7 w-auto text-xs" value="" disabled={pending} onChange={(e) => e.target.value && run({ ids, stageId: e.target.value })}>
            <option value="">Move to…</option>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select aria-label="Assign" className="h-7 w-auto text-xs" value="" disabled={pending} onChange={(e) => e.target.value && run({ ids, assigneeId: e.target.value === "__none" ? null : e.target.value })}>
            <option value="">Assign…</option>
            <option value="__none">Unassigned</option>
            {users.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </Select>
          <Select aria-label="Priority" className="h-7 w-auto text-xs" value="" disabled={pending} onChange={(e) => e.target.value && run({ ids, priority: e.target.value as "URGENT" })}>
            <option value="">Priority…</option>
            {Object.entries(PRIORITY).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
          </Select>
          <div className="flex items-center gap-1">
            <Input type="date" aria-label="Deadline" className="h-7 w-36 text-xs" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            <Button size="sm" disabled={pending || !deadline} onClick={() => run({ ids, deadline })}>Set deadline</Button>
          </div>
          <Button
            size="sm"
            variant="danger-ghost"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Delete ${selected.size} video${selected.size === 1 ? "" : "s"}? Scripts linked to them are kept. This can't be undone.`)) return;
              start(async () => {
                const r = await deleteVideos(ids);
                if (r.ok) { toast.success(r.message ?? "Deleted"); setSelected(new Set()); router.refresh(); } else toast.error(r.error);
              });
            }}
          >
            <Trash2 /> Delete
          </Button>
          <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label="Clear selection" onClick={() => setSelected(new Set())}><X /></Button>
        </div>
      )}
      <div className="rounded-xl border border-border bg-surface shadow-card">
        <Table>
          <THead>
            <TR>
              <TH className="w-8"><input type="checkbox" aria-label="Select all" className="size-4 accent-[var(--fg)]" checked={all} onChange={() => setSelected(all ? new Set() : new Set(videos.map((v) => v.id)))} /></TH>
              <TH>Video</TH>
              <TH>Stage</TH>
              <TH>Deadline</TH>
              <TH className="hidden md:table-cell">Shoot</TH>
              <TH className="hidden md:table-cell">Editor</TH>
              <TH className="hidden lg:table-cell">Package</TH>
            </TR>
          </THead>
          <TBody>
            {videos.map((v) => (
              <TR key={v.id} className={selected.has(v.id) ? "bg-surface-2/60" : "hover:bg-surface-2/40"}>
                <TD><input type="checkbox" aria-label={`Select ${v.title}`} className="size-4 accent-[var(--fg)]" checked={selected.has(v.id)} onChange={() => toggle(v.id)} /></TD>
                <TD className="max-w-80">
                  <Link href={`/videos/${v.id}`} className="block truncate font-medium hover:underline">{v.title}</Link>
                  <span className="block truncate text-xs text-muted">{v.clientName}</span>
                </TD>
                <TD><span className="flex items-center gap-1.5 whitespace-nowrap"><StageDot color={v.stageColor} />{v.stageName}</span></TD>
                <TD>
                  <div className="flex items-center gap-1">
                    <DeadlineChip deadline={v.deadline} category={v.category} today={today} warningDays={warningDays} />
                    {!v.deadline && <span className="text-xs text-subtle">—</span>}
                    <PriorityMark priority={v.priority} />
                  </div>
                </TD>
                <TD className="hidden whitespace-nowrap text-xs text-muted md:table-cell">{v.shootDate ? fmtDate(v.shootLocal.slice(0, 10), "d MMM") + " · " + v.shootLocal.slice(11) : "—"}</TD>
                <TD className="hidden md:table-cell">{v.assigneeName ? <span className="flex items-center gap-1.5 text-xs"><Avatar name={v.assigneeName} className="size-5 text-[9px]" />{v.assigneeName}</span> : <span className="text-xs text-subtle">—</span>}</TD>
                <TD className="hidden lg:table-cell">{v.isExtra ? <Badge tone="accent">Extra</Badge> : v.packageName ? <span className="text-xs text-muted">{v.packageName}</span> : <span className="text-xs text-subtle">—</span>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
