// CSV import: field definitions, header auto-mapping, parsing and validation. Pure & unit tested.
import { parseMoney, parsePercentToBp } from "../money";

export type ImportEntity = "clients" | "invoices" | "expenses" | "packages" | "tasks";

export type FieldType = "string" | "email" | "money" | "date" | "int" | "percent" | "enum" | "bool";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  aliases?: string[];
  enumValues?: Record<string, string[]>; // value → accepted spellings
};

const CLIENT_STATUS = { LEAD: ["lead", "prospect"], ACTIVE: ["active", "current"], PAUSED: ["paused", "on hold"], FORMER: ["former", "inactive", "ended", "past"] };
const PRIORITY = { URGENT: ["urgent"], HIGH: ["high"], NORMAL: ["normal", "medium"], LOW: ["low"] };
const TASK_STATUS = { TODO: ["todo", "to do", "open", "not started"], IN_PROGRESS: ["in progress", "doing", "started"], WAITING_CLIENT: ["waiting", "waiting for client", "waiting client"], DONE: ["done", "complete", "completed", "finished"] };
const EXPENSE_CATEGORY = {
  CAMERA_EQUIPMENT: ["camera", "camera equipment"],
  LENSES_ACCESSORIES: ["lens", "lenses", "accessories", "lenses & accessories"],
  SOFTWARE: ["software", "subscription", "subscriptions", "software subscriptions"],
  FREELANCE_EDITORS: ["freelance", "editor", "editors", "freelance editors"],
  TRANSPORT: ["transport", "taxi", "bus"],
  VEHICLE: ["vehicle", "car", "fuel", "petrol"],
  MARKETING: ["marketing", "advertising", "ads", "marketing & advertising"],
  OFFICE: ["office", "rent"],
  TRAVEL: ["travel", "flights", "hotel"],
  OTHER: ["other", "misc", "miscellaneous"],
};
const PAYMENT_METHOD = {
  BANK_TRANSFER: ["bank", "bank transfer", "transfer", "sepa"],
  CASH: ["cash"],
  CARD: ["card", "credit card", "debit card"],
  REVOLUT: ["revolut"],
  PAYPAL: ["paypal"],
  CHEQUE: ["cheque", "check"],
  BARTER: ["barter"],
  OTHER: ["other"],
};
const PACKAGE_TYPE = {
  MONTHLY_RETAINER: ["monthly", "retainer", "monthly retainer"],
  ONE_OFF: ["one-off", "one off", "oneoff", "project"],
  EVENT: ["event", "event coverage"],
  BUNDLE: ["bundle", "custom bundle"],
  HOURLY: ["hourly"],
  BARTER: ["barter"],
};

export const IMPORT_FIELDS: Record<ImportEntity, FieldDef[]> = {
  clients: [
    { key: "name", label: "Client name", type: "string", required: true, aliases: ["client", "client name", "name", "business", "brand"] },
    { key: "companyName", label: "Company", type: "string", aliases: ["company", "company name", "legal name"] },
    { key: "contactPerson", label: "Contact person", type: "string", aliases: ["contact", "contact person", "contact name"] },
    { key: "email", label: "Email", type: "email", aliases: ["email", "e-mail", "email address"] },
    { key: "phone", label: "Phone", type: "string", aliases: ["phone", "mobile", "tel", "telephone", "phone number"] },
    { key: "whatsapp", label: "WhatsApp", type: "string", aliases: ["whatsapp", "wa"] },
    { key: "website", label: "Website", type: "string", aliases: ["website", "web", "url", "site"] },
    { key: "instagram", label: "Instagram", type: "string", aliases: ["instagram", "ig", "insta"] },
    { key: "facebook", label: "Facebook", type: "string", aliases: ["facebook", "fb"] },
    { key: "tiktok", label: "TikTok", type: "string", aliases: ["tiktok", "tik tok"] },
    { key: "industry", label: "Industry", type: "string", aliases: ["industry", "sector", "category"] },
    { key: "status", label: "Status", type: "enum", enumValues: CLIENT_STATUS, aliases: ["status"] },
    { key: "valueCents", label: "Monthly value", type: "money", aliases: ["retainer", "monthly", "value", "monthly retainer", "price", "fee"] },
    { key: "packageLabel", label: "Package", type: "string", aliases: ["package", "package type", "plan"] },
    { key: "startedAt", label: "Started", type: "date", aliases: ["start", "start date", "started", "since"] },
    { key: "paymentTermsDays", label: "Payment terms (days)", type: "int", aliases: ["payment terms", "terms"] },
    { key: "vatNumber", label: "VAT number", type: "string", aliases: ["vat", "vat number", "vat no"] },
    { key: "driveUrl", label: "Drive folder", type: "string", aliases: ["drive", "google drive", "folder"] },
    { key: "notes", label: "Notes", type: "string", aliases: ["notes", "comments", "remarks"] },
  ],
  invoices: [
    { key: "number", label: "Invoice number", type: "string", required: true, aliases: ["invoice", "invoice number", "invoice no", "number", "inv", "#"] },
    { key: "client", label: "Client name", type: "string", required: true, aliases: ["client", "client name", "customer", "bill to"] },
    { key: "description", label: "Description", type: "string", aliases: ["description", "details", "item", "service"] },
    { key: "issueDate", label: "Issue date", type: "date", required: true, aliases: ["date", "issue date", "invoice date", "issued"] },
    { key: "dueDate", label: "Due date", type: "date", aliases: ["due", "due date"] },
    { key: "net", label: "Net amount (ex VAT)", type: "money", aliases: ["net", "subtotal", "amount ex vat", "net amount"] },
    { key: "vatRate", label: "VAT rate %", type: "percent", aliases: ["vat rate", "vat %", "rate"] },
    { key: "total", label: "Total (incl. VAT)", type: "money", aliases: ["total", "gross", "amount", "total amount"] },
    { key: "amountPaid", label: "Amount paid", type: "money", aliases: ["paid", "amount paid", "received"] },
    { key: "paidOn", label: "Payment date", type: "date", aliases: ["paid on", "payment date", "date paid"] },
    { key: "paymentMethod", label: "Payment method", type: "enum", enumValues: PAYMENT_METHOD, aliases: ["method", "payment method"] },
    { key: "notes", label: "Notes", type: "string", aliases: ["notes", "comments"] },
  ],
  expenses: [
    { key: "date", label: "Date", type: "date", required: true, aliases: ["date", "expense date"] },
    { key: "description", label: "Description", type: "string", required: true, aliases: ["description", "item", "details", "expense"] },
    { key: "amount", label: "Amount (gross)", type: "money", required: true, aliases: ["amount", "total", "gross", "cost", "price"] },
    { key: "vat", label: "VAT amount", type: "money", aliases: ["vat", "vat amount", "tax"] },
    { key: "category", label: "Category", type: "enum", enumValues: EXPENSE_CATEGORY, aliases: ["category", "type"] },
    { key: "vendor", label: "Vendor", type: "string", aliases: ["vendor", "supplier", "merchant", "payee", "shop"] },
    { key: "client", label: "Client name", type: "string", aliases: ["client", "project client"] },
    { key: "paymentMethod", label: "Payment method", type: "enum", enumValues: PAYMENT_METHOD, aliases: ["method", "payment method", "paid with"] },
    { key: "businessUsePct", label: "Business use %", type: "percent", aliases: ["business use", "business %", "business use %"] },
    { key: "notes", label: "Notes", type: "string", aliases: ["notes", "comments"] },
  ],
  packages: [
    { key: "client", label: "Client name", type: "string", required: true, aliases: ["client", "client name"] },
    { key: "name", label: "Package name", type: "string", required: true, aliases: ["package", "package name", "name", "plan"] },
    { key: "type", label: "Type", type: "enum", required: true, enumValues: PACKAGE_TYPE, aliases: ["type", "package type"] },
    { key: "videosIncluded", label: "Videos included", type: "int", aliases: ["videos", "videos included", "videos per month", "no of videos"] },
    { key: "price", label: "Price", type: "money", aliases: ["price", "amount", "fee", "monthly price"] },
    { key: "startDate", label: "Start date", type: "date", required: true, aliases: ["start", "start date"] },
    { key: "endDate", label: "End date", type: "date", aliases: ["end", "end date"] },
    { key: "notes", label: "Notes", type: "string", aliases: ["notes"] },
  ],
  tasks: [
    { key: "title", label: "Title", type: "string", required: true, aliases: ["title", "task", "name", "todo"] },
    { key: "description", label: "Description", type: "string", aliases: ["description", "details", "notes"] },
    { key: "client", label: "Client name", type: "string", aliases: ["client"] },
    { key: "priority", label: "Priority", type: "enum", enumValues: PRIORITY, aliases: ["priority"] },
    { key: "dueDate", label: "Due date", type: "date", aliases: ["due", "due date", "deadline"] },
    { key: "status", label: "Status", type: "enum", enumValues: TASK_STATUS, aliases: ["status", "state"] },
  ],
};

export const ENTITY_LABEL: Record<ImportEntity, string> = {
  clients: "Clients",
  invoices: "Invoices",
  expenses: "Expenses",
  packages: "Video packages",
  tasks: "Tasks",
};

const norm = (s: string) => s.toLowerCase().replace(/[_\-.:]+/g, " ").replace(/\s+/g, " ").trim();

/** Guess a mapping fieldKey → CSV header from header names. Each header is used at most once. */
export function autoMap(entity: ImportEntity, headers: string[]): Record<string, string | null> {
  const fields = IMPORT_FIELDS[entity];
  const used = new Set<string>();
  const out: Record<string, string | null> = {};
  // Pass 1: exact alias / label / key matches. Pass 2: header contains alias.
  for (const pass of [1, 2]) {
    for (const f of fields) {
      if (out[f.key]) continue;
      const names = [f.key, f.label, ...(f.aliases ?? [])].map(norm);
      const h = headers.find((hd) => {
        if (used.has(hd)) return false;
        const n = norm(hd);
        return pass === 1 ? names.includes(n) : names.some((a) => a.length > 2 && n.includes(a));
      });
      if (h) {
        out[f.key] = h;
        used.add(h);
      }
    }
  }
  for (const f of fields) if (!(f.key in out)) out[f.key] = null;
  return out;
}

/** Parse YYYY-MM-DD or DD/MM/YYYY (also with - or .) into YYYY-MM-DD. */
export function parseImportDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s);
  if (r) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else {
    r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
    if (!r) return null;
    [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
    if (y < 100) y += 2000;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseEnum(input: string, values: Record<string, string[]>): string | null {
  const n = norm(input);
  for (const [k, spellings] of Object.entries(values)) {
    if (norm(k) === n || norm(k.replace(/_/g, " ")) === n || spellings.map(norm).includes(n)) return k;
  }
  return null;
}

export type ParsedRow = { values: Record<string, string | number | boolean | null>; errors: string[] };

/** Validate & coerce a raw CSV row using a mapping. Missing required values are errors — never invented. */
export function parseRow(entity: ImportEntity, raw: Record<string, string>, mapping: Record<string, string | null>): ParsedRow {
  const values: ParsedRow["values"] = {};
  const errors: string[] = [];
  for (const f of IMPORT_FIELDS[entity]) {
    const header = mapping[f.key];
    const rawVal = header ? (raw[header] ?? "").toString().trim() : "";
    if (!rawVal) {
      values[f.key] = null;
      if (f.required) errors.push(`${f.label} is missing`);
      continue;
    }
    let v: string | number | boolean | null = null;
    switch (f.type) {
      case "string":
        v = rawVal.slice(0, 5000);
        break;
      case "email":
        v = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawVal) ? rawVal.toLowerCase() : null;
        if (v === null) errors.push(`${f.label} "${rawVal}" is not a valid email`);
        break;
      case "money":
        v = parseMoney(rawVal);
        if (v === null) errors.push(`${f.label} "${rawVal}" is not a valid amount`);
        break;
      case "date":
        v = parseImportDate(rawVal);
        if (v === null) errors.push(`${f.label} "${rawVal}" is not a valid date (use YYYY-MM-DD or DD/MM/YYYY)`);
        break;
      case "int": {
        const n = Number(rawVal.replace(/[^\d-]/g, ""));
        v = Number.isInteger(n) && rawVal.match(/\d/) ? n : null;
        if (v === null) errors.push(`${f.label} "${rawVal}" is not a whole number`);
        break;
      }
      case "percent":
        v = parsePercentToBp(rawVal);
        if (v === null || v < 0 || v > 10000) {
          errors.push(`${f.label} "${rawVal}" is not a valid percentage`);
          v = null;
        }
        break;
      case "enum":
        v = parseEnum(rawVal, f.enumValues ?? {});
        if (v === null) errors.push(`${f.label} "${rawVal}" is not recognised`);
        break;
      case "bool":
        v = /^(y|yes|true|1|x)$/i.test(rawVal);
        break;
    }
    values[f.key] = v;
  }
  // Entity-specific consistency
  if (entity === "invoices" && values.net === null && values.total === null && !errors.some((e) => e.includes("amount"))) {
    errors.push("Provide a net amount or a total");
  }
  return { values, errors };
}

export function dupKey(entity: ImportEntity, v: ParsedRow["values"]): string[] {
  const s = (x: unknown) => (x === null || x === undefined ? "" : String(x).toLowerCase().trim());
  switch (entity) {
    case "clients":
      return [v.name ? `name:${s(v.name)}` : "", v.email ? `email:${s(v.email)}` : ""].filter(Boolean);
    case "invoices":
      return v.number ? [`number:${s(v.number)}`] : [];
    case "expenses":
      return [`exp:${s(v.date)}|${s(v.amount)}|${s(v.description)}`];
    case "tasks":
      return [`task:${s(v.title)}|${s(v.dueDate)}`];
    case "packages":
      return [`pkg:${s(v.client)}|${s(v.name)}|${s(v.startDate)}`];
  }
}

/** Mark rows that duplicate existing records (by keys) or earlier rows in the same file. */
export function detectDuplicates(entity: ImportEntity, rows: ParsedRow[], existingKeys: Set<string>) {
  const seen = new Set<string>();
  return rows.map((r) => {
    const keys = dupKey(entity, r.values);
    const existing = keys.some((k) => existingKeys.has(k));
    const inFile = keys.some((k) => seen.has(k));
    keys.forEach((k) => seen.add(k));
    return { existing, inFile };
  });
}
