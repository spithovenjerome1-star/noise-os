// One-time data import, run at startup by `pnpm start:prod`.
// Reads JSON from the BULK_IMPORT_DATA environment variable (set temporarily in the
// hosting dashboard/API, never committed). Idempotent: clients are matched by name,
// invoices by number — existing records are never modified or duplicated.
import { PrismaClient, type PaymentMethod, type ClientStatus } from "@prisma/client";
import { z } from "zod";
import { invoiceTotals, lineAmounts } from "../src/lib/domain/invoices";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Payload = z.object({
  clients: z.array(
    z.object({
      name: z.string().min(1),
      companyName: z.string().nullish(),
      contactPerson: z.string().nullish(),
      email: z.string().nullish(),
      phone: z.string().nullish(),
      industry: z.string().nullish(),
      status: z.enum(["LEAD", "ACTIVE", "PAUSED", "FORMER"]).default("ACTIVE"),
      vatNumber: z.string().nullish(),
      billingAddress: z.string().nullish(),
      paymentTermsDays: z.number().int().nullish(),
      packageLabel: z.string().nullish(),
      valueCents: z.number().int().nullish(),
      startedAt: date.nullish(),
      notes: z.string().nullish(),
      invoices: z
        .array(
          z.object({
            number: z.string().min(1),
            issueDate: date,
            dueDate: date,
            description: z.string().nullish(),
            notes: z.string().nullish(),
            vatNote: z.string().nullish(),
            lines: z.array(z.object({ description: z.string(), qtyHundredths: z.number().int().default(100), unitCents: z.number().int(), vatRateBp: z.number().int().default(0) })).min(1),
            payments: z.array(z.object({ amountCents: z.number().int().positive(), paidOn: date, method: z.string().default("BANK_TRANSFER"), reference: z.string().nullish(), notes: z.string().nullish() })).default([]),
          }),
        )
        .default([]),
    }),
  ),
});

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function main() {
  const raw = process.env.BULK_IMPORT_DATA;
  if (!raw) return;
  const db = new PrismaClient();
  try {
    const data = Payload.parse(JSON.parse(raw));
    let clientsCreated = 0, invoicesCreated = 0, invoicesSkipped = 0, payments = 0;
    for (const c of data.clients) {
      const { invoices, startedAt, status, ...fields } = c;
      let client = await db.client.findFirst({ where: { name: c.name } });
      if (!client) {
        client = await db.client.create({ data: { ...fields, status: status as ClientStatus, startedAt: startedAt ? d(startedAt) : null } });
        clientsCreated++;
        await db.activityLog.create({ data: { actorLabel: "Import", action: "client.import", entityType: "client", entityId: client.id, clientId: client.id, summary: `Imported client ${client.name}` } });
      }
      for (const inv of invoices) {
        if (await db.invoice.findUnique({ where: { number: inv.number } })) {
          invoicesSkipped++;
          continue;
        }
        const t = invoiceTotals(inv.lines);
        await db.invoice.create({
          data: {
            number: inv.number,
            clientId: client.id,
            description: inv.description ?? null,
            notes: inv.notes ?? null,
            vatNote: inv.vatNote ?? null,
            issueDate: d(inv.issueDate),
            dueDate: d(inv.dueDate),
            status: "SENT",
            sentAt: d(inv.issueDate),
            subtotalCents: t.subtotalCents,
            vatCents: t.vatCents,
            totalCents: t.totalCents,
            lines: { create: inv.lines.map((l, i) => ({ ...l, ...lineAmounts(l), position: i })) },
            payments: {
              create: inv.payments.map((p) => ({ amountCents: p.amountCents, paidOn: d(p.paidOn), method: p.method as PaymentMethod, reference: p.reference ?? null, notes: p.notes ?? null })),
            },
          },
        });
        invoicesCreated++;
        payments += inv.payments.length;
        await db.activityLog.create({ data: { actorLabel: "Import", action: "invoice.import", entityType: "invoice", clientId: client.id, summary: `Imported invoice ${inv.number}` } });
      }
    }
    console.log(`[import] clients created: ${clientsCreated}, invoices created: ${invoicesCreated}, skipped (already exist): ${invoicesSkipped}, payments: ${payments}`);
  } catch (e) {
    // Never block the app from starting because of a bad import payload.
    console.error("[import] FAILED — nothing after the error was imported:", e instanceof Error ? e.message : e);
  } finally {
    await db.$disconnect();
  }
}

main();
