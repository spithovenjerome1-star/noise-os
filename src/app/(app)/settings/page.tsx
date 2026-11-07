import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { can } from "@/lib/permissions";
import { getSettings } from "@/server/settings";
import { PageHeader } from "@/components/ui/misc";
import { LinkTabs } from "@/components/ui/tabs";
import { ruleStates } from "@/server/automations/rules";
import { CSV_EXPORTS } from "@/server/csv-exports";
import { BusinessForm, ProductionForm, FinanceSettings, TeamPanel, AutomationsPanel, DataPanel, AccountForm } from "./panels";

export const metadata = { title: "Settings" };

const TABS = [
  { key: "business", label: "Business" },
  { key: "production", label: "Production" },
  { key: "finance", label: "Finance & VAT" },
  { key: "team", label: "Team" },
  { key: "automations", label: "Automations" },
  { key: "data", label: "Data & backup" },
  { key: "account", label: "My account" },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const { tab = "business" } = await searchParams;
  const manage = can(user.role, "settings:manage");
  // Members can still reach their own account tab.
  if (!manage && tab !== "account") redirect("/settings?tab=account");
  const visible = TABS.filter((t) => (t.key === "account" ? true : manage) && (t.key !== "team" || can(user.role, "team:manage")));
  const active = visible.some((t) => t.key === tab) ? tab : visible[0]!.key;
  const settings = await getSettings();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Settings" description="How NOISE OS works for your business.">
        <LinkTabs tabs={visible.map((t) => ({ ...t, href: `/settings?tab=${t.key}` }))} active={active} />
      </PageHeader>

      {active === "business" && <BusinessForm s={settings} />}
      {active === "production" && <ProductionForm s={settings} stageCount={await db.stage.count({ where: { archived: false } })} />}
      {active === "finance" && (
        <FinanceSettings
          estimatedTaxRateBp={settings.estimatedTaxRateBp}
          rates={await db.vatRate.findMany({ where: { archived: false }, orderBy: [{ position: "asc" }, { rateBp: "desc" }] })}
        />
      )}
      {active === "team" && (
        <TeamPanel
          meId={user.id}
          users={(await db.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], select: { id: true, name: true, email: true, role: true, active: true, canLogin: true, passwordHash: true, createdAt: true } })).map(
            ({ passwordHash, ...u }) => ({ ...u, hasPassword: Boolean(passwordHash) }),
          )}
        />
      )}
      {active === "automations" && <AutomationsPanel rules={await ruleStates()} externalCommsEnabled={settings.externalCommsEnabled} />}
      {active === "data" && (
        <DataPanel
          canExport={can(user.role, "data:export")}
          exports={Object.entries(CSV_EXPORTS)
            .filter(([, e]) => !e.finance || can(user.role, "finance:view"))
            .map(([key, e]) => ({ key, label: e.label }))}
          demoCount={
            (await db.client.count({ where: { isDemo: true } })) +
            (await db.invoice.count({ where: { isDemo: true } })) +
            (await db.expense.count({ where: { isDemo: true } })) +
            (await db.task.count({ where: { isDemo: true } })) +
            (await db.video.count({ where: { isDemo: true } })) +
            (await db.calendarEvent.count({ where: { isDemo: true } }))
          }
        />
      )}
      {active === "account" && <AccountForm name={user.name} email={user.email} />}
    </div>
  );
}
