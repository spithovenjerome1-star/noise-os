"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquare, Check, RotateCcw, Trash2, CornerDownRight } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/misc";
import { addScriptComment, resolveScriptComment, deleteScriptComment } from "@/server/scripts/actions";
import { timeAgo } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type CommentRow = {
  id: string;
  parentId: string | null;
  authorName: string;
  body: string;
  source: "TEAM" | "CLIENT";
  resolved: boolean;
  createdAt: string;
  version: number | null;
};

export function CommentsPanel({ scriptId, comments }: { scriptId: string; comments: CommentRow[] }) {
  const roots = comments.filter((c) => !c.parentId);
  const replies = (id: string) => comments.filter((c) => c.parentId === id);
  const [showResolved, setShowResolved] = React.useState(false);
  const open = roots.filter((r) => !r.resolved);
  const resolved = roots.filter((r) => r.resolved);
  const list = showResolved ? roots : open;

  return (
    <Card>
      <CardHeader
        title="Comments"
        description={open.length ? `${open.length} open thread${open.length > 1 ? "s" : ""}` : undefined}
        action={resolved.length > 0 ? <button className="text-xs text-muted hover:text-fg" onClick={() => setShowResolved((s) => !s)}>{showResolved ? "Hide" : "Show"} resolved ({resolved.length})</button> : null}
      />
      <div className="flex flex-col gap-3 px-4 pb-4">
        {list.length === 0 && <p className="flex items-center gap-2 text-[13px] text-muted"><MessageSquare className="size-4" /> No open comments.</p>}
        {list.map((c) => (
          <Thread key={c.id} root={c} replies={replies(c.id)} scriptId={scriptId} />
        ))}
        <Composer scriptId={scriptId} placeholder="Add a comment for the team…" />
      </div>
    </Card>
  );
}

function Thread({ root, replies, scriptId }: { root: CommentRow; replies: CommentRow[]; scriptId: string }) {
  const [replying, setReplying] = React.useState(false);
  const router = useRouter();
  return (
    <div className={cn("rounded-lg border border-border p-2.5", root.source === "CLIENT" && "border-violet/30 bg-violet-bg/30", root.resolved && "opacity-60")}>
      <Comment c={root} />
      {replies.map((r) => (
        <div key={r.id} className="mt-2 border-l border-border pl-3">
          <Comment c={r} />
        </div>
      ))}
      <div className="mt-2 flex items-center gap-1">
        <Button size="sm" variant="ghost" onClick={() => setReplying((r) => !r)}><CornerDownRight /> Reply</Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            const r = await resolveScriptComment(root.id, !root.resolved);
            if (r.ok) router.refresh();
            else toast.error(r.error);
          }}
        >
          {root.resolved ? <><RotateCcw /> Reopen</> : <><Check /> Resolve</>}
        </Button>
      </div>
      {replying && <Composer scriptId={scriptId} parentId={root.id} placeholder="Reply…" autoFocus onDone={() => setReplying(false)} />}
    </div>
  );
}

function Comment({ c }: { c: CommentRow }) {
  const router = useRouter();
  return (
    <div className="group flex gap-2">
      <Avatar name={c.authorName} className="mt-0.5 size-5 text-[9px]" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-medium">{c.authorName}</span>
          {c.source === "CLIENT" && <Badge tone="violet">Client</Badge>}
          {c.version && <span className="text-subtle">on v{c.version}</span>}
          <span className="text-subtle">· {timeAgo(new Date(c.createdAt))}</span>
          {c.source === "TEAM" && (
            <button
              className="ml-auto hidden text-subtle hover:text-danger group-hover:inline-flex"
              aria-label="Delete comment"
              onClick={async () => {
                if (!confirm("Delete this comment?")) return;
                const r = await deleteScriptComment(c.id);
                if (r.ok) router.refresh();
                else toast.error(r.error);
              }}
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
        <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed">{c.body}</p>
      </div>
    </div>
  );
}

function Composer({ scriptId, parentId, placeholder, autoFocus, onDone }: { scriptId: string; parentId?: string; placeholder: string; autoFocus?: boolean; onDone?: () => void }) {
  const [body, setBody] = React.useState("");
  const [pending, start] = React.useTransition();
  const router = useRouter();
  const submit = () =>
    start(async () => {
      const r = await addScriptComment(scriptId, body, parentId);
      if (r.ok) {
        setBody("");
        onDone?.();
        router.refresh();
      } else toast.error(r.error);
    });
  return (
    <div className={cn("flex flex-col gap-2", parentId && "mt-2")}>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="min-h-16"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && body.trim()) submit();
        }}
      />
      {body.trim() && (
        <div className="flex justify-end">
          <Button size="sm" variant="primary" loading={pending} onClick={submit}>Comment</Button>
        </div>
      )}
    </div>
  );
}
