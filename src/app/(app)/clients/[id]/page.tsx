import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Mail, Globe, AtSign, FolderOpen, MessageCircle, Phone, Archive } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { can } from "@/lib/permissions";
import { plainOf } from "@/lib/dates";
import { CLIENT_STATUS } from "@/lib/labels";
import { normalizeUrl, whatsappLink } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LinkTabs } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { ClientHeaderActions } from "@/components/clients/workspace-ui";
import { HealthBadge } from "@/components/clients/health-badge";
import { healthByClient, receivablesByClient } from "@/server/clients/queries";
import { OverviewTab } from "./overview-tab";
import { VideosTab, ScriptsTab } from "./production-tabs";
import { FinancesTab } from "./finances-tab";
import { CalendarTab } from "./calendar-tab";
import { FilesTab, NotesTab, PortalTab } from "./misc-tabs";

const TABS = ["overview", "videos", "scripts", "finances", "calendar", "files", "notes", "portal"] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await db.client.findUnique({ where: { id }, select: { name: true } });
  return { title: c?.name ?? "Client" };
}

function instagramUrl(h: string) {
  if (/^https?:/i.test(h)) return h;
  return `https://instagram.com/${h.replace(/^@/, "")}`;
}

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser("clients:view");
  const { id } = await params;
  const sp = await searchParams;
  const finance = can(user.role, "finance:view");
  const client = await db.client.findUnique({
    where: { id },
    include: { _count: { select: { videos: true, scripts: true, invoices: true, attachments: true, clientNotes: true, events: true } } },
  });
  if (!client) notFound();
  const visibleTabs = TABS.filter((t) => t !== "finances" || finance).filter((t) => t !== "portal" || can(user.role, "clients:edit"));
  const tab: Tab = (visibleTabs as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "overview";

  const receivables = await receivablesByClient([client.id]);
  const health = (await healthByClient([client], receivables)).get(client.id)!;

  const defaults = {
    id: client.id,
    name: client.name,
    companyName: client.companyName,
    contactPerson: client.contactPerson,
    email: client.email,
    phone: client.phone,
    whatsapp: client.whatsapp,
    website: client.website,
    instagram: client.instagram,
    facebook: client.facebook,
    tiktok: client.tiktok,
    industry: client.industry,
    status: client.status,
    valueCents: finance ? client.valueCents : null,
    packageLabel: client.packageLabel,
    startedAt: plainOf(client.startedAt),
    paymentTermsDays: client.paymentTermsDays,
    turnaroundDays: client.turnaroundDays,
    notes: client.notes,
    driveUrl: client.driveUrl,
    brandColors: client.brandColors,
    brandFonts: client.brandFonts,
    brandGuidelines: client.brandGuidelines,
    vatNumber: finance ? client.vatNumber : null,
    billingAddress: finance ? client.billingAddress : null,
    archived: Boolean(client.archivedAt),
  };

  const wa = whatsappLink(client.whatsapp ?? client.phone);
  const links = [
    wa && { href: wa, icon: MessageCircle, label: "WhatsApp" },
    client.email && { href: `mailto:${client.email}`, icon: Mail, label: client.email },
    client.phone && { href: `tel:${client.phone.replace(/\s/g, "")}`, icon: Phone, label: client.phone },
    client.instagram && { href: instagramUrl(client.instagram), icon: AtSign, label: "Instagram" },
    client.website && { href: normalizeUrl(client.website)!, icon: Globe, label: "Website" },
    client.driveUrl && { href: client.driveUrl, icon: FolderOpen, label: "Google Drive" },
  ].filter(Boolean) as { href: string; icon: React.ComponentType<{ className?: string }>; label: string }[];

  const c = client._count;
  const tabDefs: Record<Tab, { label: string; count?: number }> = {
    overview: { label: "Overview" },
    videos: { label: "Videos", count: c.videos },
    scripts: { label: "Scripts", count: c.scripts },
    finances: { label: "Finances", count: c.invoices },
    calendar: { label: "Calendar" },
    files: { label: "Files", count: c.attachments },
    notes: { label: "Notes", count: c.clientNotes },
    portal: { label: "Client portal" },
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/clients" className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
          <ChevronLeft className="size-3.5" /> Clients
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight">{client.name}</h1>
              <Badge tone={CLIENT_STATUS[client.status].tone}>{CLIENT_STATUS[client.status].label}</Badge>
              <HealthBadge health={health} />
              {client.archivedAt && (
                <Badge>
                  <Archive className="size-3" /> Archived
                </Badge>
              )}
              {client.isDemo && <Badge tone="accent">Demo data</Badge>}
            </div>
            <p className="mt-1 text-[13px] text-muted">
              {[client.companyName !== client.name ? client.companyName : null, client.industry, client.contactPerson].filter(Boolean).join(" · ") || "No details yet"}
            </p>
            {links.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {links.map((l) => (
                  <Tooltip key={l.href} content={l.label}>
                    <Button variant="secondary" size="sm" asChild>
                      <a href={l.href} target={l.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" aria-label={l.label}>
                        <l.icon />
                        <span className="hidden max-w-40 truncate sm:inline">{l.label}</span>
                      </a>
                    </Button>
                  </Tooltip>
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <ClientHeaderActions client={defaults} canEdit={can(user.role, "clients:edit")} canDelete={can(user.role, "clients:delete")} canFinance={finance} invoiceCount={c.invoices} />
          </div>
        </div>
      </div>

      <LinkTabs
        active={tab}
        tabs={visibleTabs.map((t) => ({ key: t, label: tabDefs[t].label, count: tabDefs[t].count || undefined, href: t === "overview" ? `/clients/${id}` : `/clients/${id}?tab=${t}` }))}
      />

      <div className="animate-in" key={tab}>
        {tab === "overview" && <OverviewTab client={client} user={user} health={health} />}
        {tab === "videos" && <VideosTab clientId={id} />}
        {tab === "scripts" && <ScriptsTab clientId={id} />}
        {tab === "finances" && finance && <FinancesTab clientId={id} canEdit={can(user.role, "finance:edit")} />}
        {tab === "calendar" && <CalendarTab clientId={id} />}
        {tab === "files" && <FilesTab clientId={id} canEdit={can(user.role, "production:edit")} />}
        {tab === "notes" && <NotesTab clientId={id} canEdit={can(user.role, "production:edit")} />}
        {tab === "portal" && <PortalTab clientId={id} />}
      </div>
    </div>
  );
}
