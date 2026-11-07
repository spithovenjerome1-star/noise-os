// Seeds configuration only (stages, VAT rates, settings, automation rules).
// It never creates clients, invoices or other business records.
import { PrismaClient, StageCategory } from "@prisma/client";

const db = new PrismaClient();

const STAGES: { name: string; category: StageCategory; color: string }[] = [
  { name: "Idea", category: "PLANNED", color: "zinc" },
  { name: "Scripting", category: "PLANNED", color: "zinc" },
  { name: "Approved for filming", category: "PLANNED", color: "blue" },
  { name: "Filmed", category: "FILMED", color: "orange" },
  { name: "Editing", category: "EDITING", color: "amber" },
  { name: "Internal review", category: "EDITING", color: "amber" },
  { name: "Client review", category: "AWAITING_APPROVAL", color: "violet" },
  { name: "Revision", category: "EDITING", color: "pink" },
  { name: "Approved", category: "APPROVED", color: "teal" },
  { name: "Delivered", category: "DELIVERED", color: "green" },
];

// Malta VAT rates. Rates are configurable in Settings; confirm treatment with your accountant.
const VAT = [
  { name: "Standard 18%", rateBp: 1800, isDefault: true, note: "Standard Malta VAT rate", position: 0 },
  { name: "Reduced 7%", rateBp: 700, note: null, position: 1 },
  { name: "Reduced 5%", rateBp: 500, note: null, position: 2 },
  { name: "Zero-rated / exempt", rateBp: 0, note: "e.g. Article 11 small-undertaking exemption, or exempt supply", position: 3 },
  { name: "Reverse charge (EU B2B)", rateBp: 0, note: "VAT to be accounted for by the recipient", position: 4 },
];

async function main() {
  await db.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  if ((await db.stage.count()) === 0) {
    await db.stage.createMany({ data: STAGES.map((s, i) => ({ ...s, position: i })) });
    console.log("Seeded pipeline stages");
  }
  if ((await db.vatRate.count()) === 0) {
    await db.vatRate.createMany({ data: VAT });
    console.log("Seeded VAT rates");
  }
  console.log("Seed complete (configuration only — no business records).");
}

main().finally(() => db.$disconnect());
