"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { portalSetName } from "@/server/portal/actions";

export function NameGate({ token }: { token: string }) {
  const [name, setName] = React.useState("");
  const [pending, start] = React.useTransition();
  const router = useRouter();
  return (
    <Card className="p-4">
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await portalSetName(token, name);
            if (r.ok) {
              toast.success(r.message ?? "Thanks");
              router.refresh();
            } else toast.error(r.error);
          });
        }}
      >
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-[13px] font-medium">What’s your name?</span>
          <span className="text-xs text-muted">So we know who approved or commented. Asked only once on this device.</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" className="mt-1 h-10" />
        </label>
        <Button type="submit" variant="primary" size="lg" loading={pending} disabled={!name.trim()}>Continue</Button>
      </form>
    </Card>
  );
}
