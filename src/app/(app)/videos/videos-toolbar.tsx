"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PRIORITY } from "@/lib/labels";

type Opt = { value: string; label: string };

export function VideosToolbar({ clients, users }: { clients: Opt[]; users: Opt[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = React.useState(sp.get("q") ?? "");

  const setParam = React.useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(sp.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("new");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [sp, router, pathname],
  );

  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q.trim()) setParam("q", q.trim() || null);
    }, 250);
    return () => clearTimeout(t);
  }, [q, sp, setParam]);

  const active = ["q", "client", "assignee", "priority", "due", "hideDelivered"].some((k) => sp.get(k));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-56">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search videos…" className="pl-8" aria-label="Search videos" />
      </div>
      <Select aria-label="Client" className="w-auto" value={sp.get("client") ?? ""} onChange={(e) => setParam("client", e.target.value || null)}>
        <option value="">All clients</option>
        {clients.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </Select>
      <Select aria-label="Editor" className="w-auto" value={sp.get("assignee") ?? ""} onChange={(e) => setParam("assignee", e.target.value || null)}>
        <option value="">All editors</option>
        <option value="none">Unassigned</option>
        {users.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
      </Select>
      <Select aria-label="Priority" className="w-auto" value={sp.get("priority") ?? ""} onChange={(e) => setParam("priority", e.target.value || null)}>
        <option value="">Any priority</option>
        {Object.entries(PRIORITY).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
      </Select>
      <Select aria-label="Deadline" className="w-auto" value={sp.get("due") ?? ""} onChange={(e) => setParam("due", e.target.value || null)}>
        <option value="">Any deadline</option>
        <option value="overdue">Overdue</option>
        <option value="soon">Due soon / today</option>
        <option value="ok">On track</option>
        <option value="none">No deadline</option>
      </Select>
      <label className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] text-muted hover:text-fg">
        <input type="checkbox" className="size-4 accent-[var(--fg)]" checked={sp.get("hideDelivered") === "1"} onChange={(e) => setParam("hideDelivered", e.target.checked ? "1" : null)} />
        Hide delivered
      </label>
      {active && (
        <Button variant="ghost" size="sm" asChild>
          <Link href={`${pathname}${sp.get("view") ? `?view=${sp.get("view")}` : ""}`} scroll={false}><X /> Clear</Link>
        </Button>
      )}
    </div>
  );
}
