"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ExpenseCategory, PackageType, PaymentMethod, Prisma, Priority, TaskStatus, ClientStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { assertUser } from "@/server/auth";
import { runAction, UserError, type ActionResult } from "@/server/action";
import { logActivity } from "@/server/activity";
import { getSettings } from "@/server/settings";
import { dbDate } from "@/lib/dates";
import { splitGross } from "@/lib/money";
import { invoiceTotals, lineAmounts } from "@/lib/domain/invoices";
import { ENTITY_LABEL, type ImportEntity } from "@/lib/domain/import";
import { normalizeUrl } from "@/lib/utils";
import { analyzeRows, defaultDueDate, MAX_IMPORT_ROWS, type RowAnalysis } from "./analyze";

const ENTITIES = ["clients", "invoices", "expenses", "packages", "tasks"] as const;
const input = z.object({
  entity: z.enum(ENTITIES),
  mapping: z.record(z.string(), z.string().nullable()),
  rows: z.array(z.record(z.string(), z.string())).min(1, "The file has no rows").max(MAX_IMPORT_ROWS, `Import at most ${MAX_IMPORT_ROWS} rows at a time`),
});

export async function previewImport(payload: unknown): Promise<ActionResult<{ rows: RowAnalysis[] }>> {
  return runAction(async () => {
    await assertUser("data:import");
    const d = input.parse(payload);
    return { ok: true as const, data: { rows: await analyzeRows(d.entity, d.rows, d.mapping) } };
  });
}

type Commit = { created: number; skipped: number; failed: number; logId: string };

export async function commitImport(payload: unknown): Promise<ActionResult<Commit>> {
  return runAction(async () => {
    const user = await assertUser("data:import");
    const d = input
      .extend({ fileName: z.string().max(255), decisions: z.array(z.enum(["create", "skip"])) })
      .parse(payload);
    if (d.decisions.length !== d.rows.length) throw new UserError("Row decisions don't match the file. Please preview again.");
    if (["invoices", "expenses"].includes(d.entity)) await assertUser("finance:edit");
    const analysis = await analyzeRows(d.entity, d.rows, d.mapping);
    const settings = await getSettings();

    const log = await db.importLog.create({
      data: { entity: d.entity, fileName: d.fileName || "import.csv", mapping: d.mapping as Prisma.InputJsonValue, rowsTotal: d.rows.length, created: 0, skipped: 0, failed: 0, createdById: user.id },
    });
    let created = 0, skipped = 0, failed = 0;
    let maxInvoiceSeq = 0;
    const records: Prisma.ImportRecordCreateManyInput[] = [];

    for (const a of analysis) {
      const raw = d.rows[a.index]! as Prisma.InputJsonValue;
      const base = { importLogId: log.id, rowIndex: a.index + 1, raw };
      if (a.errors.length) {
        failed++;
        records.push({ ...base, status: "FAILED", message: a.errors.join("; ").slice(0, 1000) });
        continue;
      }
      if (d.decisions[a.index] === "skip" || a.blocked) {
        skipped++;
        records.push({ ...base, status: "SKIPPED", message: a.duplicate ? `Duplicate (${a.duplicate === "existing" ? "already exists" : "repeated in file"})` : "Skipped by you" });
        continue;
      }
      try {
        const id = await createRecord(d.entity, a, settings.defaultPaymentTerms, settings.invoicePrefix);
        if (d.entity === "invoices") {
          const m = new RegExp(`^${settings.invoicePrefix.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&")}(\\d+)$`).exec(String(a.values.number));
          if (m) maxInvoiceSeq = Math.max(maxInvoiceSeq, Number(m[1]));
        }
        created++;
        records.push({ ...base, status: "CREATED", entityId: id, message: a.warnings.join("; ") || null });
      } catch (e) {
        failed++;
        const msg = e instanceof Error ? e.message : String(e);
        records.push({ ...base, status: "FAILED", message: msg.includes("Unique constraint") ? "Already exists" : msg.slice(0, 500) });
      }
    }
    // Keep invoice numbering ahead of imported numbers that use our prefix.
    if (maxInvoiceSeq >= settings.nextInvoiceNumber) await db.settings.update({ where: { id: 1 }, data: { nextInvoiceNumber: maxInvoiceSeq + 1 } });

    await db.importRecord.createMany({ data: records });
    await db.importLog.update({ where: { id: log.id }, data: { created, skipped, failed } });
    await logActivity({ actor: user, action: "import", entityType: "import", entityId: log.id, summary: `Imported ${created} ${ENTITY_LABEL[d.entity].toLowerCase()} from ${d.fileName} (${skipped} skipped, ${failed} failed)` });
    revalidatePath("/", "layout");
    return { ok: true as const, data: { created, skipped, failed, logId: log.id }, message: `Imported ${created} of ${d.rows.length} rows` };
  });
}

async function createRecord(entity: ImportEntity, a: RowAnalysis, terms: number, _prefix: string): Promise<string> {
  const v = a.values as Record<string, string | number | null>;
  const s = (k: string) => (v[k] === null || v[k] === undefined ? null : String(v[k]));
  const n = (k: string) => (v[k] === null || v[k] === undefined ? null : Number(v[k]));
  switch (entity) {
    case "clients": {
      const c = await db.client.create({
        data: {
          name: s("name")!, companyName: s("companyName"), contactPerson: s("contactPerson"), email: s("email"), phone: s("phone"), whatsapp: s("whatsapp"),
          website: normalizeUrl(s("website")), instagram: s("instagram"), facebook: s("facebook"), tiktok: s("tiktok"), industry: s("industry"),
          ...(s("status") ? { status: s("status") as ClientStatus } : {}),
          valueCents: n("valueCents"), packageLabel: s("packageLabel"), startedAt: s("startedAt") ? dbDate(s("startedAt")!) : null,
          paymentTermsDays: n("paymentTermsDays"), vatNumber: s("vatNumber"), driveUrl: normalizeUrl(s("driveUrl")), notes: s("notes"),
        },
      });
      return c.id;
    }
    case "invoices": {
      const rate = n("vatRate");
      let net: number;
      if (n("net") !== null) net = n("net")!;
      else net = splitGross(n("total")!, rate!).netCents;
      const rateBp = rate ?? (n("total") !== null && net > 0 ? Math.round(((n("total")! - net) / net) * 10000) : 0);
      const line = { qtyHundredths: 100, unitCents: net, vatRateBp: rateBp };
      const amounts = lineAmounts(line);
      const totals = invoiceTotals([line]);
      const issue = s("issueDate")!;
      const due = s("dueDate") ?? defaultDueDate(issue, terms);
      const inv = await db.invoice.create({
        data: {
          number: s("number")!, clientId: a.clientId!, description: s("description"), issueDate: dbDate(issue), dueDate: dbDate(due), status: "SENT",
          subtotalCents: totals.subtotalCents, vatCents: totals.vatCents, totalCents: totals.totalCents, notes: s("notes"), vatNote: rate === null ? "VAT rate derived from imported net and total" : null,
          lines: { create: [{ description: s("description") ?? `Invoice ${s("number")}`, ...line, netCents: amounts.netCents, vatCents: amounts.vatCents }] },
          payments: n("amountPaid") && n("amountPaid")! > 0 ? { create: [{ amountCents: n("amountPaid")!, paidOn: dbDate(s("paidOn")!), method: (s("paymentMethod") as PaymentMethod) ?? "OTHER", notes: "Imported" }] } : undefined,
        },
      });
      return inv.id;
    }
    case "expenses": {
      const e = await db.expense.create({
        data: {
          date: dbDate(s("date")!), description: s("description")!, amountCents: n("amount")!, vatCents: n("vat") ?? 0, category: (s("category") as ExpenseCategory) ?? "OTHER",
          vendor: s("vendor"), clientId: a.clientId, paymentMethod: (s("paymentMethod") as PaymentMethod) ?? "OTHER",
          businessUsePct: n("businessUsePct") !== null ? Math.round(n("businessUsePct")! / 100) : 100, notes: s("notes"),
        },
      });
      return e.id;
    }
    case "packages": {
      const p = await db.servicePackage.create({
        data: {
          clientId: a.clientId!, name: s("name")!, type: s("type") as PackageType, videosIncluded: n("videosIncluded"), priceCents: n("price") ?? 0,
          startDate: dbDate(s("startDate")!), endDate: s("endDate") ? dbDate(s("endDate")!) : null, notes: s("notes"),
        },
      });
      return p.id;
    }
    case "tasks": {
      const status = (s("status") as TaskStatus) ?? "TODO";
      const t = await db.task.create({
        data: {
          title: s("title")!, description: s("description"), clientId: a.clientId, priority: (s("priority") as Priority) ?? "NORMAL", dueDate: s("dueDate") ? dbDate(s("dueDate")!) : null,
          status, completedAt: status === "DONE" ? new Date() : null,
        },
      });
      return t.id;
    }
  }
}
