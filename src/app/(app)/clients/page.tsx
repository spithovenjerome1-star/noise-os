import Link from "next/link";
import { Plus, Users, Archive } from "lucide-react";
import type { ClientStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { CLIENT_STATUS } from "@/lib/labels";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/tabs";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ClientFormDialog } from "@/components/clients/client-form";
import { UrlSearch } from "@/components/clients/list-filters";
import { HealthBadge } from "@/components/clients/health-badge";
import { PackageProgressBar } from "@/components/clients/package-progress";
import { currentPeriodsByClient, healthByClient, receivablesByClient } from "@/server/clients/queries";
import { cn } from "@/lib/utils";

export const metadata = { title: "Clients" };

const STATUSES = ["ALL", "ACTIVE", "LEAD", "PAUSED", "FORMER"] as const;

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser("clients:view");
  const sp = await searchParams;
  const finance = can(user.role, "finance:view");
  const canEdit = can(user.role, "clients:edit");
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as (typeof STATUSES)[number]) : "ALL";
  const archived = sp.archived === "1";
  const q = sp.q?.trim();

  const where: Prisma.ClientWhereInput = {
    archivedAt: archived ? { not: null } : null,
    ...(status !== "ALL" ? { status: status as ClientStatus } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { companyName: { contains: q, mode: "insensitive" } },
            { contactPerson: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { industry: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [clients, counts, archivedCount] = await Promise.all([
    db.client.findMany({ where, orderBy: [{ status: "asc" }, { name: "asc" }] }),
    db.client.groupBy({ by: ["status"], where: { archivedAt: null }, _count: true }),
    db.client.count({ where: { archivedAt: { not: null } } }),
  ]);
  const rank: Record<ClientStatus, number> = { ACTIVE: 0, LEAD: 1, PAUSED: 2, FORMER: 3 };
  clients.sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name));
  const ids = clients.map((c) => c.id);
  const [periods, receivables] = await Promise.all([currentPeriodsByClient(ids), receivablesByClient(ids)]);
  const health = await healthByClient(clients, receivables);
  const total = counts.reduce((s, c) => s + c._count, 0);
  const countOf = (s: string) => (s === "ALL" ? total : (counts.find((c) => c.status === s)?._count ?? 0));

  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged = { status: status === "ALL" ? null : status, archived: archived ? "1" : null, q: q ?? null, ...patch };
    Object.entries(merged).forEach(([k, v]) => v && p.set(k, v));
    return `/clients${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Clients"
        description={archived ? "Archived clients keep all their history." : `${countOf("ACTIVE")} active · ${total} total`}
        actions={
          canEdit && (
            <ClientFormDialog
              canFinance={finance}
              openOnNew
              trigger={
                <Button variant="primary">
                  <Plus /> Add client
                </Button>
              }
            />
          )
        }
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {!archived && (
              <Segmented
                active={status}
                items={STATUSES.map((s) => ({
                  key: s,
                  href: href({ status: s === "ALL" ? null : s }),
                  label: (
                    <>
                      {s === "ALL" ? "All" : CLIENT_STATUS[s].label}
                      <span className="tabular text-subtle">{countOf(s)}</span>
                    </>
                  ),
                }))}
              />
            )}
            <Button variant={archived ? "primary" : "ghost"} size="sm" asChild>
              <Link href={archived ? href({ archived: null }) : href({ archived: "1", status: null })}>
                <Archive /> {archived ? "Showing archived" : `Archived (${archivedCount})`}
              </Link>
            </Button>
          </div>
          <UrlSearch placeholder="Search clients" />
        </div>
      </PageHeader>

      {clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q ? "No clients match your search" : archived ? "No archived clients" : total === 0 ? "No clients yet" : "No clients with this status"}
          description={
            total === 0 && !archived && !q
              ? "Add your first client, or import them from a spreadsheet. Nothing is created automatically."
              : undefined
          }
          action={
            total === 0 && !archived && !q && canEdit ? (
              <div className="flex gap-2">
                <Button variant="primary" asChild>
                  <Link href="/clients?new=1"><Plus /> Add client</Link>
                </Button>
                <Button asChild>
                  <Link href="/import">Import CSV</Link>
                </Button>
              </div>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden md:block">
            <Table>
              <THead>
                <TR>
                  <TH>Client</TH>
                  <TH>Status</TH>
                  <TH>Health</TH>
                  <TH className="w-56">Current package</TH>
                  {finance && <TH className="text-right">Value</TH>}
                  {finance && <TH className="text-right">Outstanding</TH>}
                </TR>
              </THead>
              <TBody>
                {clients.map((c) => {
                  const ps = periods.get(c.id) ?? [];
                  const r = receivables.get(c.id);
                  const h = health.get(c.id)!;
                  return (
                    <TR key={c.id} className="group hover:bg-surface-2/60">
                      <TD>
                        <Link href={`/clients/${c.id}`} className="flex flex-col">
                          <span className="font-medium group-hover:underline">{c.name}</span>
                          <span className="text-xs text-muted">{[c.industry, c.contactPerson].filter(Boolean).join(" · ") || c.companyName || "—"}</span>
                        </Link>
                      </TD>
                      <TD>
                        <Badge tone={CLIENT_STATUS[c.status].tone}>{CLIENT_STATUS[c.status].label}</Badge>
                      </TD>
                      <TD>
                        <HealthBadge health={h} />
                      </TD>
                      <TD>
                        {ps.length ? (
                          <div className="flex flex-col gap-1">
                            {ps.slice(0, 2).map((p) => (
                              <div key={p.id} className="flex flex-col gap-1">
                                <div className="flex justify-between text-xs">
                                  <span className="truncate text-muted">{p.packageName}</span>
                                  <span className="tabular shrink-0 pl-2">
                                    {p.progress.remaining > 0 ? `${p.progress.remaining} left` : <span className="text-success">Done</span>}
                                  </span>
                                </div>
                                <PackageProgressBar progress={p.progress} className="h-1.5" />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-subtle">{c.packageLabel ?? "No active package"}</span>
                        )}
                      </TD>
                      {finance && <TD className="tabular text-right">{c.valueCents != null ? formatMoney(c.valueCents) : <span className="text-subtle">—</span>}</TD>}
                      {finance && (
                        <TD className={cn("tabular text-right", r?.overdueCount && "text-danger")}>
                          {r?.outstanding ? formatMoney(r.outstanding) : <span className="text-subtle">—</span>}
                        </TD>
                      )}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Card>

          {/* Mobile cards */}
          <div className="flex flex-col gap-2 md:hidden">
            {clients.map((c) => {
              const ps = periods.get(c.id) ?? [];
              const r = receivables.get(c.id);
              return (
                <Link key={c.id} href={`/clients/${c.id}`}>
                  <Card className="flex flex-col gap-2.5 p-3.5 active:scale-[0.99] transition-transform">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{c.name}</div>
                        <div className="truncate text-xs text-muted">{c.industry ?? c.companyName ?? "—"}</div>
                      </div>
                      <Badge tone={CLIENT_STATUS[c.status].tone}>{CLIENT_STATUS[c.status].label}</Badge>
                    </div>
                    {ps[0] && (
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between text-xs text-muted">
                          <span>{ps[0].progress.delivered}/{ps[0].progress.included} delivered</span>
                          <span>{ps[0].progress.remaining} left</span>
                        </div>
                        <PackageProgressBar progress={ps[0].progress} className="h-1.5" />
                      </div>
                    )}
                    {finance && r?.outstanding ? (
                      <div className={cn("text-xs", r.overdueCount ? "text-danger" : "text-muted")}>
                        {formatMoney(r.outstanding)} outstanding{r.overdueCount ? " · overdue" : ""}
                      </div>
                    ) : null}
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
