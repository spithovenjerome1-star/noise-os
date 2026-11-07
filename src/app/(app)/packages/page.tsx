import Link from "next/link";
import { Package, Plus } from "lucide-react";
import type { PackageType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { can } from "@/lib/permissions";
import { dbDate, fmtDate, plainOf, todayMalta } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { computePeriodProgress, PACKAGE_TYPE_LABEL } from "@/lib/domain/packages";
import { clientOptions } from "@/server/lookups";
import { PageHeader, EmptyState, SectionTitle } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/tabs";
import { PackageProgressSummary } from "@/components/clients/package-progress";
import { PackageFormDialog } from "@/components/packages/package-form";
import { periodVideoSelect } from "@/server/clients/queries";

export const metadata = { title: "Packages" };

const TYPES = Object.keys(PACKAGE_TYPE_LABEL) as PackageType[];

export default async function PackagesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser("clients:view");
  const sp = await searchParams;
  const finance = can(user.role, "finance:view");
  const canEdit = can(user.role, "clients:edit");
  const today = todayMalta();
  const t = dbDate(today);
  const type = TYPES.includes(sp.type as PackageType) ? (sp.type as PackageType) : null;
  const showAll = sp.active === "all";
  const clientId = sp.client || null;

  const where: Prisma.ServicePackageWhereInput = {
    ...(showAll ? {} : { active: true }),
    ...(type ? { type } : {}),
    ...(clientId ? { clientId } : {}),
  };
  const [packages, clients] = await Promise.all([
    db.servicePackage.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, archivedAt: true } },
        periods: { orderBy: { startDate: "desc" }, include: { videos: periodVideoSelect } },
      },
      orderBy: [{ client: { name: "asc" } }, { startDate: "desc" }],
    }),
    canEdit ? clientOptions() : Promise.resolve([]),
  ]);

  const byClient = new Map<string, { name: string; id: string; items: typeof packages }>();
  for (const p of packages) {
    const g = byClient.get(p.clientId) ?? { name: p.client.name, id: p.client.id, items: [] };
    g.items.push(p);
    byClient.set(p.clientId, g);
  }
  const totals = packages.reduce(
    (acc, p) => {
      const period = p.periods.find((x) => x.startDate <= t && x.endDate >= t) ?? p.periods.find((x) => x.startDate <= t) ?? p.periods.at(-1);
      if (!period || !p.active) return acc;
      const prog = computePeriodProgress(period, period.videos.map((v) => ({ isExtra: v.isExtra, category: v.stage.category })));
      acc.remaining += prog.remaining;
      acc.included += prog.included;
      acc.delivered += prog.delivered;
      if (p.type === "MONTHLY_RETAINER") acc.mrr += p.priceCents;
      return acc;
    },
    { remaining: 0, included: 0, delivered: 0, mrr: 0 },
  );
  const href = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams();
    Object.entries({ type, active: showAll ? "all" : null, client: clientId, ...patch }).forEach(([k, v]) => v && q.set(k, v));
    return `/packages${q.size ? `?${q}` : ""}`;
  };
  const filteredClient = clientId ? packages[0]?.client.name ?? (await db.client.findUnique({ where: { id: clientId }, select: { name: true } }))?.name : null;

  return (
    <>
      <PageHeader
        title="Packages"
        description={
          packages.length
            ? `${totals.delivered} of ${totals.included} videos delivered this period · ${totals.remaining} still owed${finance && totals.mrr ? ` · ${formatMoney(totals.mrr)} monthly retainers` : ""}`
            : "Monthly retainers, bundles, events and one-off projects"
        }
        actions={canEdit && <PackageFormDialog clients={clients} openOnNew today={today} canFinance={finance} trigger={<Button variant="primary"><Plus /> New package</Button>} />}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            active={type ?? "ALL"}
            items={[{ key: "ALL", label: "All types", href: href({ type: null }) }, ...TYPES.map((tp) => ({ key: tp, label: PACKAGE_TYPE_LABEL[tp], href: href({ type: tp }) }))]}
          />
          <Segmented active={showAll ? "all" : "active"} items={[{ key: "active", label: "Active", href: href({ active: null }) }, { key: "all", label: "Include inactive", href: href({ active: "all" }) }]} />
          {filteredClient && (
            <Button size="sm" variant="ghost" asChild>
              <Link href={href({ client: null })}>Client: {filteredClient} ✕</Link>
            </Button>
          )}
        </div>
      </PageHeader>

      {packages.length === 0 ? (
        <EmptyState
          icon={Package}
          title={type || clientId ? "No packages match these filters" : "No packages yet"}
          description="Create a package for each client agreement — e.g. 10 videos per month for €599 — and NOISE OS tracks what's still owed each period."
          action={canEdit && !type ? <Button variant="primary" asChild><Link href={href({ new: "1" })}><Plus /> New package</Link></Button> : undefined}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {[...byClient.values()].map((g) => (
            <section key={g.id}>
              <SectionTitle action={<Link href={`/clients/${g.id}`} className="text-xs text-muted hover:text-fg">Open client →</Link>}>{g.name}</SectionTitle>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {g.items.map((p) => {
                  const period = p.periods.find((x) => x.startDate <= t && x.endDate >= t) ?? p.periods.find((x) => x.startDate <= t) ?? p.periods.at(-1);
                  const prog = period ? computePeriodProgress(period, period.videos.map((v) => ({ isExtra: v.isExtra, category: v.stage.category }))) : null;
                  return (
                    <Link key={p.id} href={`/packages/${p.id}`} className="group">
                      <Card className="flex h-full flex-col gap-3 p-4 transition-colors group-hover:border-border-strong">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-semibold">{p.name}</div>
                            <div className="text-xs text-muted">
                              {PACKAGE_TYPE_LABEL[p.type]}
                              {finance && p.priceCents ? ` · ${formatMoney(p.priceCents)}${p.type === "MONTHLY_RETAINER" ? "/mo" : ""}` : ""}
                              {p.type === "HOURLY" && finance && p.hourlyRateCents ? ` · ${formatMoney(p.hourlyRateCents)}/h` : ""}
                            </div>
                          </div>
                          {!p.active && <Badge>Inactive</Badge>}
                        </div>
                        {period && prog ? (
                          <>
                            <div className="text-xs text-subtle">
                              {fmtDate(plainOf(period.startDate), "d MMM")} – {fmtDate(plainOf(period.endDate), "d MMM yyyy")}
                              {period.rolledOverIn ? ` · +${period.rolledOverIn} rolled over` : ""}
                              {period.startDate > t ? " · starts later" : ""}
                            </div>
                            <PackageProgressSummary progress={prog} compact />
                          </>
                        ) : (
                          <p className="text-xs text-muted">No period yet</p>
                        )}
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
