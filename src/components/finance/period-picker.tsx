"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { shiftPeriod } from "./period";

export function PeriodPicker({ value, label, allowAll = true }: { value: string; label: string; allowAll?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const set = (p: string) => {
    const next = new URLSearchParams(sp.toString());
    next.set("period", p);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const now = new Date().toISOString();
  const kind = value === "all" ? "all" : value.length === 4 ? "year" : "month";
  const modes = [
    { k: "month", label: "Month", to: kind === "year" ? `${value}-${now.slice(5, 7)}` : now.slice(0, 7) },
    { k: "year", label: "Year", to: kind === "month" ? value.slice(0, 4) : now.slice(0, 4) },
    ...(allowAll ? [{ k: "all", label: "All", to: "all" }] : []),
  ];
  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
        {modes.map((m) => (
          <button
            key={m.k}
            type="button"
            onClick={() => set(m.to)}
            className={cn("h-7 rounded-md px-2.5 text-xs font-medium text-muted transition-all", kind === m.k && "bg-surface text-fg shadow-card")}
          >
            {m.label}
          </button>
        ))}
      </div>
      {kind !== "all" && (
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" aria-label="Previous period" onClick={() => set(shiftPeriod(value, -1))}>
            <ChevronLeft />
          </Button>
          <span className="tabular min-w-24 text-center text-[13px] font-medium">{label}</span>
          <Button variant="ghost" size="icon-sm" aria-label="Next period" onClick={() => set(shiftPeriod(value, 1))}>
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  );
}
