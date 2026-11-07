import { Camera } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { can } from "@/lib/permissions";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EQUIPMENT_STATUS } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { fmtMoment, plainOf } from "@/lib/dates";
import { EquipmentDialog } from "./equipment-client";

export const metadata = { title: "Equipment" };

export default async function EquipmentPage({ searchParams }: { searchParams: Promise<{ new?: string; status?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const finance = can(user.role, "finance:view");
  const now = new Date();
  const items = await db.equipment.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: {
      events: {
        where: { event: { endsAt: { gt: now } } },
        include: { event: { select: { id: true, title: true, startsAt: true, client: { select: { name: true } } } } },
        orderBy: { event: { startsAt: "asc" } },
      },
    },
  });
  const showRetired = sp.status === "all";
  const visible = items.filter((i) => showRetired || i.status !== "RETIRED");
  const categories = [...new Set(items.map((i) => i.category))];
  const groups = [...new Set(visible.map((i) => i.category))].map((c) => ({ category: c, items: visible.filter((i) => i.category === c) }));
  const total = finance ? items.filter((i) => i.status !== "RETIRED").reduce((s, i) => s + (i.purchaseCents ?? 0), 0) : 0;

  return (
    <>
      <PageHeader
        title="Equipment"
        description={`${items.filter((i) => i.status !== "RETIRED").length} items in use${finance && total ? ` · ${formatMoney(total)} purchase value` : ""}. Assign gear to shoots from the calendar.`}
        actions={
          <>
            {items.some((i) => i.status === "RETIRED") && (
              <a href={showRetired ? "/equipment" : "/equipment?status=all"} className="text-xs text-muted hover:text-fg">
                {showRetired ? "Hide retired" : "Show retired"}
              </a>
            )}
            <EquipmentDialog categories={categories} canSetPrice={can(user.role, "finance:edit")} showPrice={finance} defaultOpen={Boolean(sp.new)} />
          </>
        }
      />
      {visible.length === 0 ? (
        <EmptyState icon={Camera} title="No equipment yet" description="Add cameras, lenses, mics and lights so you can assign them to shoots and avoid double-booking." action={<EquipmentDialog categories={categories} canSetPrice={can(user.role, "finance:edit")} showPrice={finance} />} />
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <section key={g.category}>
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-subtle">{g.category}</h2>
              <Card className="divide-y divide-border">
                {g.items.map((i) => {
                  const next = i.events[0]?.event;
                  return (
                    <EquipmentDialog
                      key={i.id}
                      categories={categories}
                      canSetPrice={can(user.role, "finance:edit")}
                      showPrice={finance}
                      item={{ id: i.id, name: i.name, category: i.category, serialNumber: i.serialNumber, purchasedOn: plainOf(i.purchasedOn), purchaseCents: finance ? i.purchaseCents : null, status: i.status, notes: i.notes }}
                      upcoming={i.events.map((e) => ({ id: e.event.id, title: e.event.title, when: fmtMoment(e.event.startsAt, "EEE d MMM, HH:mm"), client: e.event.client?.name ?? null }))}
                      row={
                        <div className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/60">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] font-medium">{i.name}</div>
                            <div className="truncate text-xs text-muted">
                              {[i.serialNumber && `S/N ${i.serialNumber}`, next ? `Next: ${next.title} · ${fmtMoment(next.startsAt, "d MMM HH:mm")}` : "No upcoming shoots"].filter(Boolean).join(" · ")}
                            </div>
                          </div>
                          {i.events.length > 1 && <span className="hidden text-xs text-subtle sm:inline">{i.events.length} booked</span>}
                          {finance && i.purchaseCents !== null && <span className="tabular hidden text-[13px] text-muted sm:inline">{formatMoney(i.purchaseCents)}</span>}
                          <Badge tone={EQUIPMENT_STATUS[i.status].tone}>{EQUIPMENT_STATUS[i.status].label}</Badge>
                        </div>
                      }
                    />
                  );
                })}
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
