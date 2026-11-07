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
  // NOISE is exempt under Article 11 (small undertaking), so that is the default.
  { name: "Exempt — Article 11", rateBp: 0, isDefault: true, note: "VAT exempt under Article 11 of the VAT Act.", position: 0 },
  { name: "Standard 18%", rateBp: 1800, note: null, position: 1 },
  { name: "Reduced 7%", rateBp: 700, note: null, position: 2 },
  { name: "Reduced 5%", rateBp: 500, note: null, position: 3 },
];

async function main() {
  await db.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1, invoicePrefix: "SKV-", nextInvoiceNumber: 24, defaultPaymentTerms: 30 } });
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
