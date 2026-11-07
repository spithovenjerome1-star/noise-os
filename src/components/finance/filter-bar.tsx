"use client";
import * as React from "react";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** URL-driven search + select filters. */
export function FilterBar({ selects, placeholder = "Search…" }: { selects: { name: string; label: string; options: { value: string; label: string }[] }[]; placeholder?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = React.useState(sp.get("q") ?? "");
  const push = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [sp, router, pathname],
  );
  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q) push({ q: q || null });
    }, 250);
    return () => clearTimeout(t);
  }, [q, sp, push]);
  const active = selects.some((s) => sp.get(s.name)) || Boolean(sp.get("q"));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="pl-8" aria-label="Search" />
      </div>
      {selects.map((s) => (
        <Select key={s.name} aria-label={s.label} value={sp.get(s.name) ?? ""} onChange={(e) => push({ [s.name]: e.target.value || null })} className="w-auto min-w-36">
          <option value="">{s.label}</option>
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      ))}
      {active && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            push(Object.fromEntries([...selects.map((s) => [s.name, null]), ["q", null]]));
          }}
        >
          <X /> Clear
        </Button>
      )}
    </div>
  );
}
