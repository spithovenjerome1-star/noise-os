"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { portalDecideVideo } from "@/server/portal/actions";

export function VideoReview({ token, videoId, title, hasName }: { token: string; videoId: string; title: string; hasName: boolean }) {
  const [mode, setMode] = React.useState<"idle" | "revise">("idle");
  const [note, setNote] = React.useState("");
  const [name, setName] = React.useState("");
  const [pending, start] = React.useTransition();
  const router = useRouter();
  const submit = (decision: "APPROVED" | "CHANGES_REQUESTED") => {
    if (decision === "APPROVED" && !confirm(`Approve “${title}” as final?`)) return;
    start(async () => {
      const r = await portalDecideVideo(token, videoId, decision, decision === "CHANGES_REQUESTED" ? note : null, hasName ? null : name);
      if (r.ok) {
        toast.success(r.message ?? "Thanks!");
        setMode("idle");
        setNote("");
        router.refresh();
      } else toast.error(r.error);
    });
  };
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-violet-bg/50 p-3">
      {!hasName && <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" className="h-10 bg-surface" aria-label="Your name" />}
      {mode === "revise" ? (
        <>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What would you like changed? Timestamps help, e.g. 0:12 — use the other logo." autoFocus className="bg-surface" />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setMode("idle")}>Cancel</Button>
            <Button variant="primary" size="lg" className="flex-1 sm:flex-none" loading={pending} disabled={!note.trim() || (!hasName && !name.trim())} onClick={() => submit("CHANGES_REQUESTED")}>Send revision request</Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="primary" size="lg" className="w-full sm:w-auto sm:flex-1" loading={pending} disabled={!hasName && !name.trim()} onClick={() => submit("APPROVED")}><Check /> Approve video</Button>
          <Button size="lg" className="w-full sm:w-auto sm:flex-1" onClick={() => setMode("revise")} disabled={!hasName && !name.trim()}><PenLine /> Request changes</Button>
        </div>
      )}
    </div>
  );
}
