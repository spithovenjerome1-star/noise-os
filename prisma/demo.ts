// Optional DEMO data so the app can be explored before real data is imported.
// Every record is flagged isDemo and named "Demo · …". Remove it any time in Settings → Data.
// Never run this against your production database unless you intend to.
import { PrismaClient } from "@prisma/client";
import { addDaysPlain, dbDate, startOfMonthPlain, todayMalta, maltaLocalToUtc, endOfMonthPlain, addIntervalPlain } from "../src/lib/dates";
import { invoiceTotals, lineAmounts } from "../src/lib/domain/invoices";

const db = new PrismaClient();

async function main() {
  if (await db.client.count({ where: { isDemo: true } })) {
    console.log("Demo data already present. Remove it in Settings → Data first.");
    return;
  }
  const stages = await db.stage.findMany({ orderBy: { position: "asc" } });
  if (!stages.length) throw new Error("Run `pnpm db:seed` first.");
  const stage = (name: string) => stages.find((s) => s.name === name)!.id;
  const owner = await db.user.findFirst({ where: { role: "OWNER" } });
  const today = todayMalta();
  const mStart = startOfMonthPlain(today);
  const settings = await db.settings.findUniqueOrThrow({ where: { id: 1 } });

  const clients = await Promise.all(
    [
      { name: "Demo · Harbour Café", industry: "Hospitality", status: "ACTIVE" as const, valueCents: 59900, packageLabel: "10 videos / month" },
      { name: "Demo · Atlas Gym", industry: "Fitness", status: "ACTIVE" as const, valueCents: 45000, packageLabel: "6 videos / month" },
      { name: "Demo · Nova Boutique", industry: "Retail", status: "LEAD" as const, valueCents: null, packageLabel: null },
    ].map((c) => db.client.create({ data: { ...c, isDemo: true, contactPerson: "Demo contact", paymentTermsDays: 14, startedAt: dbDate(addIntervalPlain(mStart, "MONTHLY", -3)) } })),
  );
  const [cafe, gym] = clients;

  const mkPackage = async (clientId: string, name: string, videos: number, price: number) => {
    const p = await db.servicePackage.create({
      data: { clientId, name, type: "MONTHLY_RETAINER", videosIncluded: videos, priceCents: price, startDate: dbDate(addIntervalPlain(mStart, "MONTHLY", -1)), rolloverPolicy: "NONE" },
    });
    const prev = await db.packagePeriod.create({ data: { packageId: p.id, startDate: dbDate(addIntervalPlain(mStart, "MONTHLY", -1)), endDate: dbDate(addDaysPlain(mStart, -1)), videosIncluded: videos, status: "CLOSED", closedAt: new Date() } });
    const cur = await db.packagePeriod.create({ data: { packageId: p.id, startDate: dbDate(mStart), endDate: dbDate(endOfMonthPlain(mStart)), videosIncluded: videos } });
    return { p, prev, cur };
  };
  const cafePkg = await mkPackage(cafe.id, "Social retainer — 10 videos", 10, 59900);
  const gymPkg = await mkPackage(gym.id, "Reels retainer — 6 videos", 6, 45000);

  const vids: [string, string, string, string, number | null][] = [
    // client, period, title, stage, filmed days ago
    [cafe.id, cafePkg.cur.id, "Brunch menu launch", "Delivered", 12],
    [cafe.id, cafePkg.cur.id, "Barista latte art", "Delivered", 10],
    [cafe.id, cafePkg.cur.id, "Sunset terrace", "Approved", 6],
    [cafe.id, cafePkg.cur.id, "Meet the chef", "Client review", 5],
    [cafe.id, cafePkg.cur.id, "Weekend specials", "Editing", 3],
    [cafe.id, cafePkg.cur.id, "Behind the bar", "Filmed", 1],
    [cafe.id, cafePkg.cur.id, "Customer reactions", "Scripting", null],
    [gym.id, gymPkg.cur.id, "New class schedule", "Delivered", 9],
    [gym.id, gymPkg.cur.id, "Trainer tips #1", "Revision", 8],
    [gym.id, gymPkg.cur.id, "Member transformation", "Idea", null],
  ];
  let pos = 0;
  for (const [clientId, periodId, title, st, filmed] of vids) {
    const filmedOn = filmed !== null ? addDaysPlain(today, -filmed) : null;
    const s = stages.find((x) => x.name === st)!;
    await db.video.create({
      data: {
        title, clientId, packagePeriodId: periodId, stageId: s.id, isDemo: true, position: pos++,
        filmedOn: filmedOn ? dbDate(filmedOn) : null,
        deadline: filmedOn ? dbDate(addDaysPlain(filmedOn, settings.defaultTurnaroundDays)) : null,
        deliveredAt: s.category === "DELIVERED" ? new Date() : null,
        approvedAt: ["APPROVED", "DELIVERED"].includes(s.category) ? new Date() : null,
        assigneeId: owner?.id,
        priority: st === "Revision" ? "HIGH" : "NORMAL",
      },
    });
  }
  await db.video.create({ data: { title: "Opening night promo (extra)", clientId: cafe.id, packagePeriodId: cafePkg.cur.id, isExtra: true, stageId: stage("Approved for filming"), isDemo: true } });

  // Invoices: last month paid, this month partially paid, one overdue
  let n = settings.nextInvoiceNumber;
  const mkInvoice = async (clientId: string, desc: string, unit: number, issue: string, due: string, status: "SENT" | "DRAFT", payments: { amount: number; on: string }[], periodId?: string) => {
    const line = { qtyHundredths: 100, unitCents: unit, vatRateBp: 1800 };
    const t = invoiceTotals([line]);
    const a = lineAmounts(line);
    const number = `${settings.invoicePrefix}DEMO-${String(n++).padStart(settings.invoicePadding, "0")}`;
    await db.invoice.create({
      data: {
        number, clientId, description: desc, issueDate: dbDate(issue), dueDate: dbDate(due), status, isDemo: true, packagePeriodId: periodId,
        subtotalCents: t.subtotalCents, vatCents: t.vatCents, totalCents: t.totalCents, sentAt: status === "SENT" ? new Date() : null,
        lines: { create: [{ description: desc, ...line, ...a }] },
        payments: { create: payments.map((p) => ({ amountCents: p.amount, paidOn: dbDate(p.on), method: "BANK_TRANSFER" as const })) },
      },
    });
  };
  const lastMonth = addIntervalPlain(mStart, "MONTHLY", -1);
  await mkInvoice(cafe.id, "Social retainer — previous month", 59900, lastMonth, addDaysPlain(lastMonth, 14), "SENT", [{ amount: 70682, on: addDaysPlain(lastMonth, 10) }], cafePkg.prev.id);
  await mkInvoice(gym.id, "Reels retainer — previous month", 45000, lastMonth, addDaysPlain(lastMonth, 14), "SENT", [], gymPkg.prev.id);
  await mkInvoice(cafe.id, "Social retainer — this month", 59900, mStart, addDaysPlain(mStart, 14), "SENT", [{ amount: 30000, on: addDaysPlain(mStart, 3) }], cafePkg.cur.id);
  await mkInvoice(gym.id, "Reels retainer — this month", 45000, mStart, addDaysPlain(mStart, 14), "DRAFT", [], gymPkg.cur.id);

  const expenses = [
    { description: "Demo · Adobe Creative Cloud", amountCents: 7199, vatCents: 1098, category: "SOFTWARE" as const, vendor: "Adobe", date: addDaysPlain(mStart, 1) },
    { description: "Demo · Freelance editor — 4 reels", amountCents: 32000, vatCents: 0, vatReclaimable: false, category: "FREELANCE_EDITORS" as const, vendor: "Freelancer", date: addDaysPlain(mStart, 2) },
    { description: "Demo · Fuel", amountCents: 6000, vatCents: 915, category: "VEHICLE" as const, vendor: "Fuel station", date: addDaysPlain(mStart, 4), businessUsePct: 70 },
    { description: "Demo · ND filter set", amountCents: 18900, vatCents: 2883, category: "LENSES_ACCESSORIES" as const, vendor: "Camera shop", date: addDaysPlain(lastMonth, 8) },
  ];
  for (const e of expenses) await db.expense.create({ data: { ...e, date: dbDate(e.date), isDemo: true } });

  await db.task.createMany({
    data: [
      { title: "Send Harbour Café weekend specials for review", clientId: cafe.id, dueDate: dbDate(today), priority: "HIGH", isDemo: true },
      { title: "Chase Atlas Gym invoice", clientId: gym.id, dueDate: dbDate(addDaysPlain(today, -1)), priority: "URGENT", isDemo: true },
      { title: "Plan next month's shoot list", dueDate: dbDate(addDaysPlain(today, 3)), isDemo: true },
    ],
  });
  await db.calendarEvent.createMany({
    data: [
      { title: "Demo · Harbour Café shoot", type: "SHOOT", clientId: cafe.id, startsAt: maltaLocalToUtc(`${addDaysPlain(today, 1)}T09:00`), endsAt: maltaLocalToUtc(`${addDaysPlain(today, 1)}T12:00`), location: "Valletta", isDemo: true },
      { title: "Demo · Atlas Gym content call", type: "MEETING", clientId: gym.id, startsAt: maltaLocalToUtc(`${addDaysPlain(today, 3)}T15:00`), endsAt: maltaLocalToUtc(`${addDaysPlain(today, 3)}T15:30`), isDemo: true },
    ],
  });
  console.log("Demo data created (flagged isDemo). Remove it in Settings → Data.");
}

main().finally(() => db.$disconnect());
