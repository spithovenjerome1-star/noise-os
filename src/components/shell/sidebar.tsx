"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "./nav";
import { cn } from "@/lib/utils";
import type { Capability } from "@/lib/permissions";

export function SidebarNav({ caps, badges, onNavigate }: { caps: Capability[]; badges: Record<string, number>; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));
  return (
    <nav className="flex flex-col gap-4 px-2 pb-4" aria-label="Main">
      {NAV.map((section, i) => {
        const items = section.items.filter((it) => !it.cap || caps.includes(it.cap));
        if (!items.length) return null;
        return (
          <div key={i} className="flex flex-col gap-px">
            {section.title && <div className="px-2 pb-1 text-[11px] font-medium text-subtle">{section.title}</div>}
            {items.map((it) => {
              const active = isActive(it.href);
              const Icon = it.icon;
              const badge = badges[it.href];
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg",
                    active && "bg-surface-2 font-medium text-fg",
                  )}
                >
                  <Icon className={cn("size-4 shrink-0 text-subtle group-hover:text-muted", active && "text-fg")} />
                  <span className="truncate">{it.label}</span>
                  {badge ? <span className="tabular ml-auto rounded-full bg-accent px-1.5 text-[10px] font-semibold leading-4 text-white">{badge > 99 ? "99+" : badge}</span> : null}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
