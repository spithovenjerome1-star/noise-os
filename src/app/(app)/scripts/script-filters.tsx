"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input, Select } from "@/components/ui/input";

export function ScriptFilters({ clients, statuses }: { clients: { value: string; label: string }[]; statuses: { value: string; label: string }[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(sp.toString());
    if (v) p.set(k, v);
    else p.delete(k);
    p.delete("new");
    router.replace(`/scripts${p.size ? `?${p}` : ""}`, { scroll: false });
  };
  useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q) set("q", q);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return (
    <div className="flex flex-wrap gap-2">
      <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search scripts" className="pl-8" aria-label="Search scripts" />
      </div>
      <Select value={sp.get("status") ?? ""} onChange={(e) => set("status", e.target.value)} className="w-auto" aria-label="Status">
        <option value="">All statuses</option>
        {statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </Select>
      <Select value={sp.get("client") ?? ""} onChange={(e) => set("client", e.target.value)} className="w-auto max-w-52" aria-label="Client">
        <option value="">All clients</option>
        {clients.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </Select>
    </div>
  );
}
