"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { portalDecideScript } from "@/server/portal/actions";

export function ScriptDecision({ token, scriptId, hasName }: { token: string; scriptId: string; hasName: boolean }) {
  const [mode, setMode] = React.useState<"idle" | "changes">("idle");
  const [note, setNote] = React.useState("");
  const [name, setName] = React.useState("");
  const [pending, start] = React.useTransition();
  const router = useRouter();
  const needName = !hasName && !name.trim();
  const submit = (d: "APPROVED" | "CHANGES_REQUESTED") => {
    if (d === "APPROVED" && !confirm("Approve this script? We'll film based on this version.")) return;
    start(async () => {
      const r = await portalDecideScript(token, scriptId, d, d === "CHANGES_REQUESTED" ? note : null, hasName ? null : name);
      if (r.ok) {
        toast.success(r.message ?? "Thanks!");
        router.refresh();
      } else toast.error(r.error);
    });
  };
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight">Your decision</h2>
        <p className="text-[13px] text-muted">Happy with it? Approve. Want changes? Tell us what to adjust.</p>
      </div>
      {!hasName && <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" className="h-10" aria-label="Your name" />}
      {mode === "changes" ? (
        <>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should we change?" autoFocus className="min-h-28" />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setMode("idle")}>Cancel</Button>
            <Button variant="primary" size="lg" className="flex-1 sm:flex-none" disabled={!note.trim() || needName} loading={pending} onClick={() => submit("CHANGES_REQUESTED")}>Send change request</Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="primary" size="lg" className="w-full sm:w-auto sm:flex-1" disabled={needName} loading={pending} onClick={() => submit("APPROVED")}><Check /> Approve script</Button>
          <Button size="lg" className="w-full sm:w-auto sm:flex-1" disabled={needName} onClick={() => setMode("changes")}><PenLine /> Request changes</Button>
        </div>
      )}
    </Card>
  );
}
