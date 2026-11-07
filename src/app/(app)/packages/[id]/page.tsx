import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { can } from "@/lib/permissions";
import { addDaysPlain, dbDate, fmtDate, plainOf, todayMalta } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { CATEGORY_LABEL, CATEGORY_ORDER, computePeriodProgress, computeRollover, monthlyPeriodEnd, PACKAGE_TYPE_LABEL, ROLLOVER_LABEL, isRecurring } from "@/lib/domain/packages";
import { STAGE_COLORS } from "@/lib/labels";
import { clientOptions } from "@/server/lookups";
import { getSettings } from "@/server/settings";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DefinitionList, SectionTitle } from "@/components/ui/misc";
import { PackageProgressSummary } from "@/components/clients/package-progress";
import { PackageFormDialog } from "@/components/packages/package-form";
import { ClosePeriodButton, EditPeriodDialog, NewPeriodDialog, ReopenPeriodButton, SyncPeriodsButton } from "@/components/packages/period-actions";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await db.servicePackage.findUnique({ where: { id }, select: { name: true } });
  return { title: p?.name ?? "Package" };
}

export default async function PackagePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("clients:view");
  const { id } = await params;
  const finance = can(user.role, "finance:view");
  const canEdit = can(user.role, "clients:edit");
  const today = todayMalta();
  const t = dbDate(today);
  const pkg = await db.servicePackage.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, turnaroundDays: true } },
      periods: {
        orderBy: { startDate: "desc" },
        include: { videos: { select: { id: true, title: true, isExtra: true, stage: { select: { name: true, category: true, color: true } } }, orderBy: { createdAt: "asc" } } },
      },
    },
  });
  if (!pkg) notFound();
  const [clients, settings] = await Promise.all([canEdit ? clientOptions(true) : Promise.resolve([]), getSettings()]);

  const periods = pkg.periods.map((p) => ({
    ...p,
    progress: computePeriodProgress(p, p.videos.map((v) => ({ isExtra: v.isExtra, category: v.stage.category }))),
  }));
  const current = periods.find((p) => p.startDate <= t && p.endDate >= t) ?? periods.find((p) => p.startDate <= t) ?? periods.at(-1);
  const latest = periods[0];
  const suggestedStart = latest ? addDaysPlain(plainOf(latest.endDate)!, 1) : plainOf(pkg.startDate)!;
  const suggestedEnd = isRecurring(pkg.type) ? monthlyPeriodEnd(plainOf(pkg.startDate)!, suggestedStart) : plainOf(pkg.endDate) ?? addDaysPlain(suggestedStart, 30);
  const rolloverPreview = latest ? computeRollover(pkg.rolloverPolicy, pkg.rolloverCap, latest.progress) : 0;
  const turnaround = pkg.turnaroundDays ?? pkg.client.turnaroundDays ?? settings.defaultTurnaroundDays;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/packages" className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
          <ChevronLeft className="size-3.5" /> Packages
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{pkg.name}</h1>
              <Badge>{PACKAGE_TYPE_LABEL[pkg.type]}</Badge>
              {!pkg.active && <Badge tone="warning">Inactive</Badge>}
            </div>
            <p className="mt-1 text-[13px] text-muted">
              <Link href={`/clients/${pkg.client.id}`} className="hover:text-fg hover:underline">{pkg.client.name}</Link>
              {pkg.videosIncluded != null ? ` · ${pkg.videosIncluded} videos${isRecurring(pkg.type) ? "/month" : ""}` : ""}
              {finance && pkg.priceCents ? ` · ${formatMoney(pkg.priceCents)}${isRecurring(pkg.type) ? "/month" : ""}` : ""}
            </p>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <SyncPeriodsButton packageId={pkg.id} />
              <NewPeriodDialog packageId={pkg.id} suggestedStart={suggestedStart} suggestedEnd={suggestedEnd} videosIncluded={pkg.videosIncluded ?? 0} rolloverPreview={rolloverPreview} />
              <PackageFormDialog
                clients={clients}
                today={today}
                canFinance={finance}
                pkg={{
                  id: pkg.id,
                  clientId: pkg.clientId,
                  name: pkg.name,
                  type: pkg.type,
                  videosIncluded: pkg.videosIncluded,
                  priceCents: pkg.priceCents,
                  hourlyRateCents: pkg.hourlyRateCents,
                  startDate: plainOf(pkg.startDate)!,
                  endDate: plainOf(pkg.endDate),
                  active: pkg.active,
                  autoRenew: pkg.autoRenew,
                  rolloverPolicy: pkg.rolloverPolicy,
                  rolloverCap: pkg.rolloverCap,
                  turnaroundDays: pkg.turnaroundDays,
                  barterTerms: pkg.barterTerms,
                  notes: pkg.notes,
                }}
                trigger={<Button><Pencil /> Edit</Button>}
              />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Current period"
            description={current ? `${fmtDate(plainOf(current.startDate))} – ${fmtDate(plainOf(current.endDate))}` : undefined}
            action={
              <Button size="sm" variant="ghost" asChild>
                <Link href={`/videos?new=1&client=${pkg.clientId}`}><Plus /> Add video</Link>
              </Button>
            }
          />
          <CardBody>
            {current ? (
              <div className="flex flex-col gap-5">
                <div className="flex items-end gap-6">
                  <div>
                    <div className="tabular text-4xl font-semibold tracking-tight">{current.progress.remaining}</div>
                    <div className="text-xs text-muted">videos remaining</div>
                  </div>
                  <div className="flex-1"><PackageProgressSummary progress={current.progress} /></div>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {CATEGORY_ORDER.map((c) => (
                    <div key={c} className="rounded-lg border border-border px-2.5 py-2">
                      <div className="tabular text-lg font-semibold">{current.progress.counts[c]}</div>
                      <div className="text-[11px] text-muted">{CATEGORY_LABEL[c]}</div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-subtle">
                  Each video is counted once, in its current stage. &ldquo;Approved&rdquo; work is complete but not yet delivered; only delivered videos reduce what&apos;s owed.
                </p>
              </div>
            ) : (
              <p className="text-[13px] text-muted">No period yet. Use &ldquo;New period&rdquo; or &ldquo;Sync periods&rdquo;.</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Terms" />
          <CardBody className="[&_dd]:whitespace-normal sm:[&_dl]:grid-cols-1 lg:[&_dl]:grid-cols-2">
            <DefinitionList
              items={[
                { label: "Start", value: fmtDate(plainOf(pkg.startDate)) },
                { label: "End", value: pkg.endDate ? fmtDate(plainOf(pkg.endDate)) : "Ongoing" },
                ...(isRecurring(pkg.type)
                  ? [
                      { label: "Renewal", value: pkg.autoRenew ? "New period every month" : "Manual" },
                      { label: "Unused videos", value: `${ROLLOVER_LABEL[pkg.rolloverPolicy]}${pkg.rolloverPolicy === "ROLLOVER_CAPPED" ? ` (max ${pkg.rolloverCap})` : ""}` },
                    ]
                  : []),
                { label: "Delivery turnaround", value: `${turnaround} days after filming${pkg.turnaroundDays == null ? " (inherited)" : ""}` },
                ...(finance && pkg.type === "HOURLY" ? [{ label: "Hourly rate", value: formatMoney(pkg.hourlyRateCents) }] : []),
                ...(pkg.type === "BARTER" ? [{ label: "Barter terms", value: pkg.barterTerms }] : []),
              ]}
            />
            {pkg.notes && <p className="mt-4 whitespace-pre-wrap border-t border-border pt-3 text-[13px] text-muted">{pkg.notes}</p>}
          </CardBody>
        </Card>
      </div>

      <section>
        <SectionTitle>All periods</SectionTitle>
        <div className="flex flex-col gap-3">
          {periods.map((p) => {
            const isCurrent = p.id === current?.id;
            const preview = computeRollover(pkg.rolloverPolicy, pkg.rolloverCap, p.progress);
            return (
              <Card key={p.id} className={cn("p-4", isCurrent && "border-border-strong")}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 text-[13px] font-medium">
                      {fmtDate(plainOf(p.startDate), "d MMM")} – {fmtDate(plainOf(p.endDate), "d MMM yyyy")}
                      {isCurrent && <Badge tone="info">Current</Badge>}
                      <Badge tone={p.status === "OPEN" ? "success" : "neutral"}>{p.status === "OPEN" ? "Open" : "Closed"}</Badge>
                    </div>
                    <div className="text-xs text-muted">
                      {p.videosIncluded} included{p.rolledOverIn ? ` + ${p.rolledOverIn} rolled over` : ""}
                      {p.notes ? ` · ${p.notes}` : ""}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <EditPeriodDialog period={{ id: p.id, videosIncluded: p.videosIncluded, rolledOverIn: p.rolledOverIn, notes: p.notes }} />
                      {p.status === "OPEN" ? <ClosePeriodButton id={p.id} remaining={p.progress.remaining} rolloverPreview={preview} /> : <ReopenPeriodButton id={p.id} />}
                    </div>
                  )}
                </div>
                <div className="mt-3 max-w-xl"><PackageProgressSummary progress={p.progress} /></div>
                {p.videos.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {p.videos.map((v) => (
                      <li key={v.id}>
                        <Link href={`/videos/${v.id}`} className="inline-flex max-w-64 items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-2">
                          <span className={cn("size-1.5 shrink-0 rounded-full", STAGE_COLORS[v.stage.color] ?? "bg-zinc-400")} />
                          <span className="truncate">{v.title}</span>
                          <span className="shrink-0 text-subtle">· {v.stage.name}</span>
                          {v.isExtra && <span className="shrink-0 text-accent">extra</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
          {periods.length === 0 && <p className="text-[13px] text-muted">No periods yet.</p>}
        </div>
      </section>
    </div>
  );
}
