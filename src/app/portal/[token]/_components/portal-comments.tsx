"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/misc";
import { portalCommentScript } from "@/server/portal/actions";
import { timeAgo } from "@/lib/dates";

type C = { id: string; parentId: string | null; authorName: string; body: string; source: "TEAM" | "CLIENT"; createdAt: string; version: number | null };

export function PortalComments({ token, scriptId, comments, hasName }: { token: string; scriptId: string; comments: C[]; hasName: boolean }) {
  const [body, setBody] = React.useState("");
  const [name, setName] = React.useState("");
  const [pending, start] = React.useTransition();
  const router = useRouter();
  const roots = comments.filter((c) => !c.parentId);
  return (
    <Card className="flex flex-col gap-4 p-4">
      <h2 className="text-[15px] font-semibold tracking-tight">Comments</h2>
      {roots.length === 0 && <p className="text-[13px] text-muted">Questions or small notes? Leave them here.</p>}
      {roots.map((r) => (
        <div key={r.id} className="flex flex-col gap-2">
          <Bubble c={r} />
          {comments.filter((c) => c.parentId === r.id).map((c) => (
            <div key={c.id} className="ml-7"><Bubble c={c} /></div>
          ))}
        </div>
      ))}
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await portalCommentScript(token, scriptId, body, null, hasName ? null : name);
            if (r.ok) {
              setBody("");
              toast.success("Comment sent");
              router.refresh();
            } else toast.error(r.error);
          });
        }}
      >
        {!hasName && <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" className="h-10" aria-label="Your name" />}
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a comment…" />
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={pending} disabled={!body.trim() || (!hasName && !name.trim())}>Send comment</Button>
        </div>
      </form>
    </Card>
  );
}

function Bubble({ c }: { c: C }) {
  return (
    <div className="flex gap-2">
      <Avatar name={c.authorName} className="mt-0.5 size-5 text-[9px]" />
      <div className="min-w-0 flex-1 rounded-lg bg-surface-2 px-3 py-2">
        <div className="text-xs text-muted">
          <span className="font-medium text-fg">{c.source === "TEAM" ? `${c.authorName} · NOISE` : c.authorName}</span> · {timeAgo(new Date(c.createdAt))}
        </div>
        <p className="mt-0.5 whitespace-pre-wrap text-[14px] leading-relaxed">{c.body}</p>
      </div>
    </div>
  );
}
