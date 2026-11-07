"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Check, RotateCcw, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { markNotificationRead, resolveNotification } from "@/server/automations/actions";

export function NotificationRow({
  n,
}: {
  n: { id: string; title: string; body: string | null; href: string | null; type: string; severity: string; clientName: string | null; read: boolean; resolved: boolean; ago: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Failed");
      router.refresh();
    });

  const content = (
    <div className="min-w-0 flex-1">
      <div className={cn("truncate text-[13px]", !n.read && !n.resolved ? "font-medium text-fg" : "text-muted", n.resolved && "line-through decoration-subtle")}>{n.title}</div>
      <div className="mt-0.5 truncate text-xs text-subtle">
        {[n.body, n.ago].filter(Boolean).join(" · ")}
      </div>
    </div>
  );

  return (
    <div className={cn("group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2/60", pending && "opacity-60")}>
      <span className={cn("size-1.5 shrink-0 rounded-full", !n.read && !n.resolved ? "bg-accent" : "bg-transparent")} aria-hidden />
      {n.href ? (
        <Link href={n.href} className="min-w-0 flex-1" onClick={() => !n.read && markNotificationRead(n.id)}>
          {content}
        </Link>
      ) : (
        content
      )}
      <div className="flex shrink-0 items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
        {!n.resolved && (
          <Tooltip content={n.read ? "Mark unread" : "Mark read"}>
            <Button variant="ghost" size="icon-sm" aria-label={n.read ? "Mark unread" : "Mark read"} onClick={() => run(() => markNotificationRead(n.id, !n.read))}>
              <Circle className={cn(!n.read && "fill-current")} />
            </Button>
          </Tooltip>
        )}
        <Tooltip content={n.resolved ? "Reopen" : "Resolve"}>
          <Button variant="ghost" size="icon-sm" aria-label={n.resolved ? "Reopen" : "Resolve"} onClick={() => run(() => resolveNotification(n.id, !n.resolved))}>
            {n.resolved ? <RotateCcw /> : <Check />}
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
