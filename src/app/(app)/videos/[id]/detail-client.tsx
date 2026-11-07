"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FilePlus, Trash2 } from "lucide-react";
import { ActionForm, ActionButton, SubmitButton } from "@/components/form";
import { TextAreaField, TextField } from "@/components/fields";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/misc";
import { addVideoComment, deleteVideoComment, ensureVideoScript, addVideoTime, deleteTimeEntry, deleteVideos, batchUpdateVideos } from "@/server/videos/actions";
import { fmtDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Comment = { id: string; authorName: string; authorId: string | null; body: string; source: "TEAM" | "CLIENT"; createdAt: string; ago: string };

export function CommentsPanel({ videoId, comments, canEdit, currentUserId }: { videoId: string; comments: Comment[]; canEdit: boolean; currentUserId: string }) {
  return (
    <div className="flex flex-col gap-4">
      {comments.length === 0 ? (
        <p className="text-[13px] text-muted">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((c) => (
            <li key={c.id} className={cn("group flex gap-2.5", c.source === "CLIENT" && "rounded-lg bg-violet-bg/60 p-2.5")}>
              <Avatar name={c.authorName} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-fg">{c.authorName}</span>
                  {c.source === "CLIENT" ? <Badge tone="violet">Client feedback</Badge> : <Badge>Internal</Badge>}
                  <span className="text-subtle" title={c.createdAt}>{c.ago}</span>
                  {canEdit && c.source === "TEAM" && c.authorId === currentUserId && (
                    <ActionButton
                      size="icon-sm"
                      variant="ghost"
                      className="ml-auto opacity-0 group-hover:opacity-100 focus:opacity-100"
                      aria-label="Delete comment"
                      confirm="Delete this comment?"
                      action={() => deleteVideoComment(c.id)}
                      successMessage="Comment deleted"
                    >
                      <Trash2 />
                    </ActionButton>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <ActionForm action={addVideoComment.bind(null, videoId)} resetOnSuccess successMessage="Comment added" className="flex flex-col gap-2">
          <TextAreaField name="body" placeholder="Add an internal comment…" rows={2} />
          <div className="flex justify-end">
            <SubmitButton size="sm">Comment</SubmitButton>
          </div>
        </ActionForm>
      )}
    </div>
  );
}

export function ScriptButton({ videoId }: { videoId: string }) {
  const router = useRouter();
  return (
    <ActionButton action={() => ensureVideoScript(videoId)} onSuccess={(d) => d && router.push(`/scripts/${d.id}`)} successMessage={false} className="w-full">
      <FilePlus /> Write script
    </ActionButton>
  );
}

type Entry = { id: string; date: string; minutes: number; note: string | null; userName: string | null };

export function TimeLogPanel({ videoId, entries, canEdit, today }: { videoId: string; entries: Entry[]; canEdit: boolean; today: string }) {
  return (
    <div className="flex flex-col gap-3">
      {entries.length > 0 && (
        <ul className="flex flex-col gap-1">
          {entries.map((e) => (
            <li key={e.id} className="group flex items-center gap-2 text-[13px]">
              <span className="tabular w-14 text-muted">{Math.floor(e.minutes / 60)}h {String(e.minutes % 60).padStart(2, "0")}m</span>
              <span className="min-w-0 flex-1 truncate">{e.note || <span className="text-subtle">{e.userName ?? "—"}</span>}</span>
              <span className="text-xs text-subtle">{fmtDate(e.date, "d MMM")}</span>
              {canEdit && (
                <ActionButton size="icon-sm" variant="ghost" className="opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label="Delete entry" confirm="Delete this time entry?" action={() => deleteTimeEntry(e.id)} successMessage="Deleted">
                  <Trash2 />
                </ActionButton>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <ActionForm action={addVideoTime.bind(null, videoId)} resetOnSuccess successMessage="Time logged" className="grid grid-cols-[1fr_56px_56px] gap-2">
          <TextField name="date" type="date" defaultValue={today} aria-label="Date" />
          <TextField name="hours" type="number" min={0} max={24} placeholder="h" aria-label="Hours" />
          <TextField name="minutes" type="number" min={0} max={59} placeholder="m" aria-label="Minutes" />
          <TextField name="note" placeholder="What was done (optional)" className="col-span-2" aria-label="Note" />
          <SubmitButton size="md" variant="secondary">Log</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}

export function DeleteVideoButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  return (
    <ActionButton
      variant="danger-ghost"
      size="sm"
      confirm={`Delete “${title}”? Comments, approvals and files attached to it are deleted too. This can't be undone.`}
      action={() => deleteVideos([id])}
      onSuccess={() => router.push("/videos")}
      successMessage="Video deleted"
    >
      <Trash2 /> Delete video
    </ActionButton>
  );
}

export function QuickStage({ videoId, stageId, stages }: { videoId: string; stageId: string; stages: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Select
      aria-label="Move to stage"
      className="h-7 w-auto text-xs"
      value={stageId}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        start(async () => {
          const r = await batchUpdateVideos({ ids: [videoId], stageId: next });
          if (r.ok) {
            toast.success(`Moved to ${stages.find((s) => s.id === next)?.name}`);
            router.refresh();
          } else toast.error(r.error);
        });
      }}
    >
      {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </Select>
  );
}
