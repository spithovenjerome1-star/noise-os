import Link from "next/link";
import { Library } from "lucide-react";
import type { LibraryType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { clientOptions } from "@/server/lookups";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { LIBRARY_TYPE } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { LibraryCard, LibraryDialog, LibrarySearch } from "./library-client";

export const metadata = { title: "Creative library" };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ type?: string; tag?: string; q?: string; new?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const type = sp.type && sp.type in LIBRARY_TYPE ? (sp.type as LibraryType) : undefined;
  const where: Prisma.LibraryItemWhereInput = {
    ...(type ? { type } : {}),
    ...(sp.tag ? { tags: { has: sp.tag } } : {}),
    ...(sp.q ? { OR: [{ title: { contains: sp.q, mode: "insensitive" } }, { body: { contains: sp.q, mode: "insensitive" } }] } : {}),
  };
  const [items, all, clients] = await Promise.all([
    db.libraryItem.findMany({ where, orderBy: { updatedAt: "desc" }, include: { client: { select: { name: true } } } }),
    db.libraryItem.findMany({ select: { tags: true, type: true } }),
    clientOptions(),
  ]);
  const tagCounts = new Map<string, number>();
  all.forEach((i) => i.tags.forEach((t) => tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)));
  const tags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { type: sp.type, tag: sp.tag, q: sp.q, ...patch };
    Object.entries(merged).forEach(([k, v]) => v && p.set(k, v));
    const s = p.toString();
    return s ? `/library?${s}` : "/library";
  };

  return (
    <>
      <PageHeader
        title="Creative library"
        description="Reusable concepts, hooks, captions, shot lists and templates."
        actions={<LibraryDialog clients={clients} defaultOpen={Boolean(sp.new)} />}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1">
            <FilterPill href={qs({ type: undefined })} active={!type}>All <span className="text-subtle">{all.length}</span></FilterPill>
            {(Object.keys(LIBRARY_TYPE) as LibraryType[]).map((t) => (
              <FilterPill key={t} href={qs({ type: t })} active={type === t}>
                {LIBRARY_TYPE[t]} <span className="text-subtle">{all.filter((i) => i.type === t).length}</span>
              </FilterPill>
            ))}
          </div>
          <LibrarySearch defaultValue={sp.q ?? ""} />
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map(([t, n]) => (
              <Link key={t} href={qs({ tag: sp.tag === t ? undefined : t })} className={cn("rounded-full border px-2 py-0.5 text-xs transition-colors", sp.tag === t ? "border-fg bg-fg text-bg" : "border-border text-muted hover:text-fg")}>
                #{t} <span className="opacity-60">{n}</span>
              </Link>
            ))}
          </div>
        )}
      </PageHeader>
      {items.length === 0 ? (
        <EmptyState
          icon={Library}
          title={all.length ? "No matches" : "Your library is empty"}
          description={all.length ? "Try a different filter or search." : "Save hooks that worked, caption formulas and shot lists so the next script starts faster."}
          action={!all.length ? <LibraryDialog clients={clients} /> : undefined}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((i) => (
            <LibraryCard key={i.id} item={{ id: i.id, type: i.type, title: i.title, body: i.body, tags: i.tags, clientId: i.clientId, clientName: i.client?.name ?? null }} clients={clients} />
          ))}
        </div>
      )}
    </>
  );
}

function FilterPill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} scroll={false} className={cn("flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors", active ? "bg-surface-2 text-fg" : "text-muted hover:text-fg")}>
      {children}
    </Link>
  );
}
