import Link from "next/link";
import { cn } from "@/lib/utils";

/** URL-driven tabs (server-friendly, shareable, back-button safe). */
export function LinkTabs({ tabs, active, className }: { tabs: { key: string; label: string; href: string; count?: number }[]; active: string; className?: string }) {
  return (
    <nav className={cn("-mx-1 flex gap-0.5 overflow-x-auto border-b border-border scrollbar-thin", className)} aria-label="Tabs">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          scroll={false}
          aria-current={t.key === active ? "page" : undefined}
          className={cn(
            "relative flex h-9 shrink-0 items-center gap-1.5 px-2.5 text-[13px] text-muted transition-colors hover:text-fg",
            t.key === active && "text-fg after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-fg",
          )}
        >
          {t.label}
          {typeof t.count === "number" && <span className="tabular rounded bg-surface-2 px-1 text-[11px] text-subtle">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function Segmented({ items, active }: { items: { key: string; label: React.ReactNode; href: string }[]; active: string }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          scroll={false}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted transition-all [&_svg]:size-3.5",
            i.key === active && "bg-surface text-fg shadow-card",
          )}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}
