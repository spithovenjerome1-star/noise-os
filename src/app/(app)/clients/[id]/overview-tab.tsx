import Link from "next/link";
import { Plus, ArrowUpRight, Pencil, Activity } from "lucide-react";
import type { Client } from "@prisma/client";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/server/auth";
import { can } from "@/lib/permissions";
import { fmtDate, plainOf, timeAgo } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PACKAGE_TYPE_LABEL } from "@/lib/domain/packages";
import { HEALTH_LABEL, type HealthResult } from "@/lib/domain/health";
import { PROJECT_STATUS } from "@/lib/labels";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DefinitionList } from "@/components/ui/misc";
import { PackageProgressSummary } from "@/components/clients/package-progress";
import { ContactDialog, ProjectDialog } from "@/components/clients/workspace-ui";
import { currentPeriodsByClient, receivablesByClient } from "@/server/clients/queries";
import { getSettings } from "@/server/settings";
import { cn } from "@/lib/utils";

export async function OverviewTab({ client, user, health }: { client: Client; user: CurrentUser; health: HealthResult }) {
  const finance = can(user.role, "finance:view");
  const canEdit = can(user.role, "clients:edit");
  const [periods, receivables, contacts, projects, activity, settings, inactivePkgs] = await Promise.all([
    currentPeriodsByClient([client.id]),
    finance ? receivablesByClient([client.id]) : Promise.resolve(new Map()),
    db.contact.findMany({ where: { clientId: client.id }, orderBy: [{ isPrimary: "desc" }, { name: "asc" }] }),
    db.project.findMany({ where: { clientId: client.id }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], include: { _count: { select: { videos: true } } } }),
    db.activityLog.findMany({ where: { clientId: client.id }, orderBy: { createdAt: "desc" }, take: 25 }),
    getSettings(),
    db.servicePackage.count({ where: { clientId: client.id, active: false } }),
  ]);
  const current = periods.get(client.id) ?? [];
  const r = receivables.get(client.id);
  const colors = (client.brandColors ?? "").split(/[,\s]+/).filter((c) => /^#?[0-9a-f]{3,8}$/i.test(c)).map((c) => (c.startsWith("#") ? c : `#${c}`));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <Card>
          <CardHeader
            title="Packages"
            description={current.length ? "Current period progress" : undefined}
            action={
              canEdit && (
                <Button size="sm" variant="ghost" asChild>
                  <Link href={`/packages?new=1&client=${client.id}`}><Plus /> New package</Link>
                </Button>
              )
            }
          />
          <CardBody className="flex flex-col gap-4">
            {current.length === 0 ? (
              <p className="text-[13px] text-muted">
                No active package.{client.packageLabel ? ` Label on file: “${client.packageLabel}”.` : ""} Create one to track videos owed per period.
              </p>
            ) : (
              current.map((p) => (
                <div key={p.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link href={`/packages/${p.packageId}`} className="text-[13px] font-medium hover:underline">{p.packageName}</Link>
                      <div className="text-xs text-muted">
                        {PACKAGE_TYPE_LABEL[p.packageType as keyof typeof PACKAGE_TYPE_LABEL]} · {fmtDate(p.startDate, "d MMM")} – {fmtDate(p.endDate, "d MMM yyyy")}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon-sm" asChild aria-label="Open package">
                      <Link href={`/packages/${p.packageId}`}><ArrowUpRight /></Link>
                    </Button>
                  </div>
                  <PackageProgressSummary progress={p.progress} />
                </div>
              ))
            )}
            {inactivePkgs > 0 && <Link href={`/packages?client=${client.id}&active=all`} className="text-xs text-muted hover:text-fg">{inactivePkgs} inactive package{inactivePkgs === 1 ? "" : "s"} →</Link>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Projects"
            action={canEdit && <ProjectDialog clientId={client.id} canFinance={finance} trigger={<Button size="sm" variant="ghost"><Plus /> New project</Button>} />}
          />
          <CardBody>
            {projects.length === 0 ? (
              <p className="text-[13px] text-muted">No projects. Use projects for one-off productions, campaigns or events.</p>
            ) : (
              <ul className="divide-y divide-border">
                {projects.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{p.name}</div>
                      <div className="text-xs text-muted">
                        {[p.dueDate ? `Due ${fmtDate(plainOf(p.dueDate))}` : null, `${p._count.videos} video${p._count.videos === 1 ? "" : "s"}`, finance && p.budgetCents != null ? `Budget ${formatMoney(p.budgetCents)}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <Badge tone={PROJECT_STATUS[p.status].tone}>{PROJECT_STATUS[p.status].label}</Badge>
                    {canEdit && (
                      <ProjectDialog
                        clientId={client.id}
                        canFinance={finance}
                        project={{ id: p.id, name: p.name, description: p.description, status: p.status, startDate: plainOf(p.startDate), dueDate: plainOf(p.dueDate), budgetCents: p.budgetCents }}
                        trigger={<Button variant="ghost" size="icon-sm" aria-label={`Edit ${p.name}`}><Pencil /></Button>}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Activity" description="Chronological record of important actions" />
          <CardBody>
            {activity.length === 0 ? (
              <p className="text-[13px] text-muted">Nothing recorded yet.</p>
            ) : (
              <ol className="relative flex flex-col gap-3 border-l border-border pl-4">
                {activity.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 size-2 rounded-full border-2 border-surface bg-border-strong" />
                    <div className="text-[13px]">{a.summary}</div>
                    <div className="text-xs text-subtle">
                      {a.actorLabel} · <time dateTime={a.createdAt.toISOString()}>{timeAgo(a.createdAt)}</time>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <DefinitionList
              items={[
                { label: "Contact person", value: client.contactPerson },
                { label: "Industry", value: client.industry },
                { label: "Email", value: client.email },
                { label: "Phone", value: client.phone },
                { label: "Working together since", value: client.startedAt ? fmtDate(plainOf(client.startedAt)) : null },
                { label: "Delivery turnaround", value: `${client.turnaroundDays ?? settings.defaultTurnaroundDays} days${client.turnaroundDays == null ? " (default)" : ""}` },
                ...(finance
                  ? [
                      { label: "Retainer / value", value: client.valueCents != null ? formatMoney(client.valueCents) : null },
                      { label: "Payment terms", value: `${client.paymentTermsDays ?? settings.defaultPaymentTerms} days${client.paymentTermsDays == null ? " (default)" : ""}` },
                      { label: "Outstanding", value: r?.outstanding ? <span className={cn(r.overdueCount && "text-danger")}>{formatMoney(r.outstanding)}{r.overdueCount ? ` · ${r.overdueCount} overdue` : ""}</span> : formatMoney(0) },
                      { label: "VAT number", value: client.vatNumber },
                    ]
                  : []),
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Health" action={<Activity className="size-4 text-subtle" />} />
          <CardBody className="flex flex-col gap-2">
            <Badge tone={HEALTH_LABEL[health.level].tone} dot className="self-start">{HEALTH_LABEL[health.level].label}</Badge>
            <ul className="flex flex-col gap-1 text-[13px] text-muted">
              {health.reasons.map((x) => <li key={x}>• {x}</li>)}
            </ul>
            <p className="text-[11px] text-subtle">Based on invoices, revisions, logged hours and activity over the last 90 days.</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Contacts" action={canEdit && <ContactDialog clientId={client.id} trigger={<Button size="sm" variant="ghost"><Plus /> Add</Button>} />} />
          <CardBody>
            {contacts.length === 0 ? (
              <p className="text-[13px] text-muted">No additional contacts.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {contacts.map((ct) => (
                  <li key={ct.id} className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[13px] font-medium">
                        {ct.name} {ct.isPrimary && <Badge tone="info">Primary</Badge>}
                      </div>
                      <div className="truncate text-xs text-muted">{[ct.role, ct.email, ct.phone].filter(Boolean).join(" · ")}</div>
                    </div>
                    {canEdit && <ContactDialog clientId={client.id} contact={ct} trigger={<Button variant="ghost" size="icon-sm" aria-label={`Edit ${ct.name}`}><Pencil /></Button>} />}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Brand" />
          <CardBody className="flex flex-col gap-3 text-[13px]">
            {colors.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {colors.map((c) => (
                  <span key={c} className="flex items-center gap-1.5 rounded-md border border-border px-1.5 py-1 font-mono text-[11px]">
                    <span className="size-3.5 rounded-sm border border-border" style={{ background: c }} /> {c}
                  </span>
                ))}
              </div>
            )}
            {client.brandColors && colors.length === 0 && <div><span className="text-xs text-subtle">Colours</span><p>{client.brandColors}</p></div>}
            {client.brandFonts && <div><span className="text-xs text-subtle">Fonts</span><p>{client.brandFonts}</p></div>}
            {client.brandGuidelines && <div><span className="text-xs text-subtle">Guidelines</span><p className="whitespace-pre-wrap">{client.brandGuidelines}</p></div>}
            {!client.brandColors && !client.brandFonts && !client.brandGuidelines && <p className="text-muted">No brand guidelines yet. Upload brand assets under Files.</p>}
          </CardBody>
        </Card>

        {client.notes && (
          <Card>
            <CardHeader title="Internal notes" description="Not visible to the client" />
            <CardBody><p className="whitespace-pre-wrap text-[13px]">{client.notes}</p></CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
