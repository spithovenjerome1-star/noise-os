"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Menu, Plus, LogOut, X, User as UserIcon } from "lucide-react";
import { SidebarNav } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";
import { CommandMenuProvider, SearchTrigger } from "./command-menu";
import { QUICK_ACTIONS } from "./nav";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Avatar } from "@/components/ui/misc";
import type { Capability } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export function AppShell({
  user,
  caps,
  badges,
  businessName,
  logoutAction,
  children,
}: {
  user: { name: string; email: string; role: string };
  caps: Capability[];
  badges: Record<string, number>;
  businessName: string;
  logoutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const pathname = usePathname();
  React.useEffect(() => setMobileOpen(false), [pathname]);

  const brand = (
    <Link href="/" className="flex items-center gap-2 px-2 py-1">
      <span className="flex size-6 items-center justify-center rounded-md bg-fg text-[10px] font-black tracking-tighter text-bg">N</span>
      <span className="text-[13px] font-semibold tracking-tight">{businessName} <span className="font-normal text-subtle">OS</span></span>
    </Link>
  );

  return (
    <CommandMenuProvider caps={caps}>
      <div className="flex min-h-dvh">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-border bg-bg lg:flex">
          <div className="flex h-12 items-center px-2">{brand}</div>
          <div className="flex-1 overflow-y-auto pt-1 scrollbar-thin">
            <SidebarNav caps={caps} badges={badges} />
          </div>
          <div className="flex items-center justify-between border-t border-border px-3 py-2.5">
            <ThemeToggle />
            <span className="text-[11px] text-subtle">Europe/Malta</span>
          </div>
        </aside>

        {/* Mobile drawer */}
        <div className={cn("fixed inset-0 z-40 lg:hidden", mobileOpen ? "pointer-events-auto" : "pointer-events-none")}>
          <div className={cn("absolute inset-0 bg-black/30 transition-opacity", mobileOpen ? "opacity-100" : "opacity-0")} onClick={() => setMobileOpen(false)} />
          <aside className={cn("absolute inset-y-0 left-0 flex w-72 flex-col border-r border-border bg-bg transition-transform duration-200", mobileOpen ? "translate-x-0" : "-translate-x-full")}>
            <div className="flex h-12 items-center justify-between px-2">
              {brand}
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SidebarNav caps={caps} badges={badges} onNavigate={() => setMobileOpen(false)} />
            </div>
            <div className="border-t border-border p-3">
              <ThemeToggle />
            </div>
          </aside>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="no-print sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-bg/80 px-3 backdrop-blur-md sm:px-5">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <Menu />
            </Button>
            <div className="flex-1">
              <SearchTrigger />
            </div>
            <Dropdown>
              <DropdownTrigger asChild>
                <Button variant="primary" size="sm" aria-label="Create">
                  <Plus /> <span className="hidden sm:inline">New</span>
                </Button>
              </DropdownTrigger>
              <DropdownContent>
                <DropdownLabel>Create</DropdownLabel>
                {QUICK_ACTIONS.filter((a) => !a.cap || caps.includes(a.cap)).map((a) => (
                  <DropdownItem key={a.href} asChild>
                    <Link href={a.href}>{a.label}</Link>
                  </DropdownItem>
                ))}
              </DropdownContent>
            </Dropdown>
            <Button variant="ghost" size="icon" asChild aria-label="Inbox">
              <Link href="/notifications" className="relative">
                <Bell />
                {badges["/notifications"] ? <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-accent ring-2 ring-bg" /> : null}
              </Link>
            </Button>
            <Dropdown>
              <DropdownTrigger asChild>
                <button className="rounded-full focus-visible:outline-2" aria-label="Account">
                  <Avatar name={user.name} className="size-7" />
                </button>
              </DropdownTrigger>
              <DropdownContent className="w-56">
                <div className="px-2 py-1.5">
                  <div className="truncate text-[13px] font-medium">{user.name}</div>
                  <div className="truncate text-xs text-muted">{user.email}</div>
                </div>
                <DropdownSeparator />
                {caps.includes("settings:manage") && (
                  <DropdownItem asChild>
                    <Link href="/settings?tab=team"><UserIcon /> Team & account</Link>
                  </DropdownItem>
                )}
                <DropdownItem onSelect={() => logoutAction()}>
                  <LogOut /> Sign out
                </DropdownItem>
              </DropdownContent>
            </Dropdown>
          </header>
          <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6 sm:py-6 animate-in">{children}</main>
        </div>
      </div>
    </CommandMenuProvider>
  );
}
