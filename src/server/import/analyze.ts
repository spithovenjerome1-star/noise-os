import "server-only";
import { db } from "@/lib/db";
import { IMPORT_FIELDS, detectDuplicates, parseRow, type ImportEntity, type ParsedRow } from "@/lib/domain/import";
import { addDaysPlain, dbDate } from "@/lib/dates";

export const MAX_IMPORT_ROWS = 5000;

export type RowAnalysis = {
  index: number;
  values: ParsedRow["values"];
  errors: string[];
  warnings: string[];
  duplicate: "existing" | "file" | null;
  clientId: string | null;
  /** Creating is impossible (e.g. invoice number already used). */
  blocked: boolean;
};

const lower = (v: unknown) => String(v ?? "").toLowerCase().trim();

/** Validate rows server-side (never trusting the browser) and resolve references to existing records. */
export async function analyzeRows(entity: ImportEntity, rows: Record<string, string>[], mapping: Record<string, string | null>): Promise<RowAnalysis[]> {
  if (!IMPORT_FIELDS[entity]) throw new Error("Unknown import type");
  const parsed = rows.map((r) => parseRow(entity, r, mapping));

  // Client references (by name, case-insensitive). We never auto-create clients from other imports.
  const needsClient = entity !== "clients";
  const clients = needsClient ? await db.client.findMany({ select: { id: true, name: true, companyName: true } }) : [];
  const byName = new Map<string, string>();
  for (const c of clients) {
    byName.set(lower(c.name), c.id);
    if (c.companyName && !byName.has(lower(c.companyName))) byName.set(lower(c.companyName), c.id);
  }

  const existing = new Set<string>();
  if (entity === "clients") {
    const all = await db.client.findMany({ select: { name: true, email: true } });
    all.forEach((c) => {
      existing.add(`name:${lower(c.name)}`);
      if (c.email) existing.add(`email:${lower(c.email)}`);
    });
  } else if (entity === "invoices") {
    const nums = parsed.map((p) => p.values.number).filter(Boolean) as string[];
    (await db.invoice.findMany({ where: { number: { in: nums } }, select: { number: true } })).forEach((i) => existing.add(`number:${lower(i.number)}`));
  } else if (entity === "expenses") {
    const dates = parsed.map((p) => p.values.date).filter(Boolean) as string[];
    if (dates.length) {
      const min = dates.reduce((a, b) => (a < b ? a : b));
      const max = dates.reduce((a, b) => (a > b ? a : b));
      (await db.expense.findMany({ where: { date: { gte: dbDate(min), lte: dbDate(max) } }, select: { date: true, amountCents: true, description: true } })).forEach((e) =>
        existing.add(`exp:${e.date.toISOString().slice(0, 10)}|${e.amountCents}|${lower(e.description)}`),
      );
    }
  } else if (entity === "tasks") {
    (await db.task.findMany({ select: { title: true, dueDate: true } })).forEach((t) => existing.add(`task:${lower(t.title)}|${t.dueDate ? t.dueDate.toISOString().slice(0, 10) : ""}`));
  } else if (entity === "packages") {
    (await db.servicePackage.findMany({ select: { name: true, startDate: true, client: { select: { name: true } } } })).forEach((p) =>
      existing.add(`pkg:${lower(p.client.name)}|${lower(p.name)}|${p.startDate.toISOString().slice(0, 10)}`),
    );
  }
  const dups = detectDuplicates(entity, parsed, existing);

  return parsed.map((p, index) => {
    const errors = [...p.errors];
    const warnings: string[] = [];
    let clientId: string | null = null;
    const clientName = p.values.client as string | null | undefined;
    if (needsClient && clientName) {
      clientId = byName.get(lower(clientName)) ?? null;
      if (!clientId) errors.push(`Client “${clientName}” doesn't exist yet — import or add clients first`);
    }
    if (entity === "invoices") {
      const v = p.values;
      if (v.net === null && v.total !== null && v.vatRate === null) errors.push("Add a VAT rate column (use 0 for no VAT) so the net amount can be calculated");
      if (v.amountPaid !== null && (v.amountPaid as number) > 0 && !v.paidOn) errors.push("Payment date is needed when an amount paid is given");
      if (!v.dueDate && v.issueDate) warnings.push("No due date — default payment terms will be used");
      if (v.net !== null && v.total !== null && v.vatRate === null && (v.total as number) < (v.net as number)) errors.push("Total is lower than the net amount");
    }
    if (entity === "expenses") {
      if (!p.values.category) warnings.push("No category — will be filed as Other");
      if (p.values.vat !== null && p.values.amount !== null && (p.values.vat as number) > (p.values.amount as number)) errors.push("VAT is larger than the amount");
    }
    if (entity === "packages" && p.values.endDate && p.values.startDate && (p.values.endDate as string) < (p.values.startDate as string)) errors.push("End date is before the start date");
    const duplicate = dups[index]!.existing ? "existing" : dups[index]!.inFile ? "file" : null;
    const blocked = entity === "invoices" && duplicate !== null; // invoice numbers must stay unique
    return { index, values: p.values, errors, warnings, duplicate, clientId, blocked };
  });
}

export function defaultDueDate(issue: string, terms: number) {
  return addDaysPlain(issue, terms);
}
