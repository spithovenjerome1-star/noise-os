"use client";
import * as React from "react";
import { Command } from "cmdk";
import * as D from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { Search, Plus, ArrowRight, Users, Clapperboard, FileText, Receipt, Wallet, CheckSquare, FolderKanban, CalendarCheck, CornerDownLeft } from "lucide-react";
import { NAV, QUICK_ACTIONS } from "./nav";
import type { Capability } from "@/lib/permissions";
import { Kbd } from "@/components/ui/misc";

type Result = { type: string; id: string; title: string; subtitle?: string; href: string };

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  client: Users,
  video: Clapperboard,
  script: FileText,
  invoice: Receipt,
  expense: Wallet,
  task: CheckSquare,
  project: FolderKanban,
  booking: CalendarCheck,
};
const TYPE_LABEL: Record<string, string> = { client: "Clients", video: "Videos", script: "Scripts", invoice: "Invoices", expense: "Expenses", task: "Tasks", project: "Projects", booking: "Bookings" };

const CommandCtx = React.createContext<{ open: () => void }>({ open: () => {} });
export const useCommandMenu = () => React.useContext(CommandCtx);

export function CommandMenuProvider({ caps, children }: { caps: Capability[]; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<Result[]>([]);
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();

  // Global shortcuts: ⌘K / Ctrl+K / "/" to open, "G then X" to navigate.
  React.useEffect(() => {
    let gPressed = 0;
    const shortcuts = new Map<string, string>();
    NAV.flatMap((s) => s.items).forEach((i) => {
      if (i.shortcut && (!i.cap || caps.includes(i.cap))) shortcuts.set(i.shortcut.split(" ")[1]!.toLowerCase(), i.href);
    });
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (e.key.toLowerCase() === "g") {
        gPressed = Date.now();
        return;
      }
      if (Date.now() - gPressed < 1000) {
        const href = shortcuts.get(e.key.toLowerCase());
        if (href) {
          e.preventDefault();
          router.push(href);
        }
        gPressed = 0;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [caps, router]);

  React.useEffect(() => {
    if (!open) return;
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal });
        if (res.ok) setResults((await res.json()).results);
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open]);

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };

  const grouped = results.reduce<Record<string, Result[]>>((acc, r) => {
    (acc[r.type] ??= []).push(r);
    return acc;
  }, {});

  return (
    <CommandCtx.Provider value={{ open: () => setOpen(true) }}>
      {children}
      <D.Root open={open} onOpenChange={setOpen}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-black/25 data-[state=open]:animate-in dark:bg-black/50" />
          <D.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-24px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-pop data-[state=open]:animate-pop">
            <D.Title className="sr-only">Search and commands</D.Title>
            <D.Description className="sr-only">Search records or run a quick action</D.Description>
            <Command shouldFilter={true} loop className="flex flex-col">
              <div className="flex items-center gap-2 border-b border-border px-3">
                <Search className="size-4 text-subtle" />
                <Command.Input
                  value={q}
                  onValueChange={setQ}
                  placeholder="Search clients, videos, invoices… or type a command"
                  className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
                />
                {loading && <span className="size-3.5 animate-spin rounded-full border-2 border-subtle border-r-transparent" />}
                <Kbd>esc</Kbd>
              </div>
              <Command.List className="max-h-[60vh] overflow-y-auto p-1.5 scrollbar-thin">
                <Command.Empty className="px-3 py-8 text-center text-[13px] text-muted">{q.length < 2 ? "Type at least 2 characters" : loading ? "Searching…" : "No results"}</Command.Empty>
                {Object.entries(grouped).map(([type, items]) => (
                  <Command.Group key={type} heading={TYPE_LABEL[type] ?? type} className="cmdk-group">
                    {items.map((r) => {
                      const Icon = TYPE_ICON[r.type] ?? ArrowRight;
                      return (
                        <Item key={r.type + r.id} value={`${r.title} ${r.subtitle ?? ""} ${r.id}`} onSelect={() => go(r.href)}>
                          <Icon className="size-4 text-subtle" />
                          <span className="truncate">{r.title}</span>
                          {r.subtitle && <span className="ml-auto truncate pl-3 text-xs text-subtle">{r.subtitle}</span>}
                        </Item>
                      );
                    })}
                  </Command.Group>
                ))}
                <Command.Group heading="Quick actions" className="cmdk-group">
                  {QUICK_ACTIONS.filter((a) => !a.cap || caps.includes(a.cap)).map((a) => (
                    <Item key={a.href} value={`${a.label} ${a.keywords ?? ""}`} onSelect={() => go(a.href)}>
                      <Plus className="size-4 text-subtle" />
                      {a.label}
                    </Item>
                  ))}
                </Command.Group>
                <Command.Group heading="Go to" className="cmdk-group">
                  {NAV.flatMap((s) => s.items)
                    .filter((i) => !i.cap || caps.includes(i.cap))
                    .map((i) => (
                      <Item key={i.href} value={`go ${i.label}`} onSelect={() => go(i.href)}>
                        <i.icon className="size-4 text-subtle" />
                        {i.label}
                        {i.shortcut && <span className="ml-auto flex gap-1">{i.shortcut.split(" ").map((k) => <Kbd key={k}>{k}</Kbd>)}</span>}
                      </Item>
                    ))}
                </Command.Group>
              </Command.List>
              <div className="flex items-center gap-3 border-t border-border px-3 py-2 text-[11px] text-subtle">
                <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
                <span className="flex items-center gap-1"><Kbd><CornerDownLeft className="size-3" /></Kbd> open</span>
                <span className="ml-auto flex items-center gap-1"><Kbd>G</Kbd> then a letter to jump</span>
              </div>
            </Command>
          </D.Content>
        </D.Portal>
      </D.Root>
    </CommandCtx.Provider>
  );
}

function Item({ children, ...props }: React.ComponentProps<typeof Command.Item>) {
  return (
    <Command.Item
      className="flex h-9 cursor-default select-none items-center gap-2.5 rounded-md px-2.5 text-[13px] data-[selected=true]:bg-surface-2"
      {...props}
    >
      {children}
    </Command.Item>
  );
}

export function SearchTrigger() {
  const { open } = useCommandMenu();
  return (
    <button
      type="button"
      onClick={open}
      className="flex h-8 w-full max-w-sm items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-[13px] text-subtle shadow-card transition-colors hover:border-border-strong hover:text-muted"
    >
      <Search className="size-3.5" />
      <span className="flex-1 text-left">Search or jump to…</span>
      <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
    </button>
  );
}
