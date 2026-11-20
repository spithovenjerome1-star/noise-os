// Google Sheets → NOISE OS parsing. Pure functions: rows in, typed records + issues out.
// Nothing here touches the database, so every layout rule is unit-tested in tests/sheets.test.ts.
//
// The sheets are human-made: dashboards above the tables, blank spacer rows, mixed date
// formats (31/10/2026, 2026-10-31, Sheets serial numbers) and amounts with or without €.
// The parsers locate each table by its header row and never guess a missing amount or date.
import type { ExpenseCategory, StageCategory } from "@prisma/client";
import { parseMoney } from "../money";
import { parseImportDate } from "./import";

export type Tab = { title: string; rows: string[][] };

export type Issue = {
  level: "warn" | "info";
  message: string;
  tab?: string;
  /** 1-based row number as shown in Google Sheets. */
  row?: number;
};

// ───────────────────────────── Cell helpers ─────────────────────────────

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export function norm(s: string | null | undefined) {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9#]+/g, " ").trim();
}

/** Loose key for matching titles across sheets ("Nissan Note Gold " ≈ "nissan note gold"). */
export function titleKey(s: string) {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function cell(row: string[] | undefined, i: number | undefined) {
  if (!row || i === undefined || i < 0) return "";
  return (row[i] ?? "").toString().trim();
}

function isBlank(row: string[] | undefined) {
  return !row || row.every((c) => !String(c ?? "").trim());
}

/** Google Sheets serial day number (days since 1899-12-30) → YYYY-MM-DD. */
export function serialToDate(n: number): string | null {
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400_000);
  return d.toISOString().slice(0, 10);
}

/** "31/10/2026", "2026-10-31", "46196" (serial) → "2026-10-31". */
export function parseSheetDate(input: string | null | undefined): string | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  if (/^\d{5}(\.\d+)?$/.test(s)) return serialToDate(Number(s));
  return parseImportDate(s);
}

/** "July 2026" / "Jul 2026" → "2026-07-01". */
export function parseMonthLabel(input: string | null | undefined): string | null {
  const m = /^([a-z]+)\.?\s+(\d{4})$/i.exec((input ?? "").trim());
  if (!m) return null;
  const idx = MONTHS.findIndex((name) => name.startsWith(m[1]!.toLowerCase()) && m[1]!.length >= 3);
  if (idx < 0) return null;
  return `${m[2]}-${String(idx + 1).padStart(2, "0")}-01`;
}

/** A tab named like a month ("November 2026") → its first day, else null. */
export function monthTabStart(title: string): string | null {
  const m = /^([a-z]+)\s+(\d{4})$/i.exec(title.trim());
  if (!m) return null;
  const idx = MONTHS.indexOf(m[1]!.toLowerCase());
  return idx < 0 ? null : `${m[2]}-${String(idx + 1).padStart(2, "0")}-01`;
}

/** Amount cell → cents. Treats "", "-" and "0" as 0 only where the caller allows it. */
export function parseAmount(input: string | null | undefined): number | null {
  const s = (input ?? "").trim();
  if (!s || s === "-" || s === "—") return null;
  return parseMoney(s);
}

/** Trailing digits of an invoice number: "SKV-0019" → 19, "24" → 24. */
export function invoiceDigits(number: string): number | null {
  const m = /(\d+)\s*$/.exec(number.trim());
  return m ? parseInt(m[1]!, 10) : null;
}

type ColumnSpec = Record<string, string[]>;

/** Find a header row: every `required` column must be present. Returns column indexes by key. */
function matchHeader(row: string[], spec: ColumnSpec, required: string[]) {
  const cols: Record<string, number> = {};
  const cells = row.map((c) => norm(c));
  for (const [key, aliases] of Object.entries(spec)) {
    const idx = cells.findIndex((c) => aliases.includes(c));
    if (idx >= 0) cols[key] = idx;
  }
  return required.every((k) => k in cols) ? cols : null;
}

function findHeader(rows: string[][], spec: ColumnSpec, required: string[], from = 0) {
  for (let r = from; r < rows.length; r++) {
    const cols = matchHeader(rows[r] ?? [], spec, required);
    if (cols) return { headerRow: r, cols };
  }
  return null;
}

/** Looks like any table header (two or more short label cells such as "Date", "Amount"). */
function looksLikeHeader(row: string[]) {
  const labels = ["date", "amount", "description", "type", "cost", "invoice number", "expense date", "client name"];
  return row.filter((c) => labels.includes(norm(c))).length >= 2;
}

/** A section title: a single non-date text cell on its own, e.g. "Owner Withdrawals (Paid to Myself)". */
function looksLikeSectionTitle(row: string[]) {
  const filled = row.map((c) => String(c ?? "").trim()).filter(Boolean);
  return filled.length === 1 && !parseSheetDate(filled[0]) && parseAmount(filled[0]) === null && /[a-z]{3,}/i.test(filled[0]!);
}

/**
 * Rows of a table below its header, stopping at the next section title or table header,
 * or after a long run of blank rows. Returns [rowIndex, row] pairs (0-based).
 */
function tableBody(rows: string[][], headerRow: number, maxBlankRun = 4): [number, string[]][] {
  const out: [number, string[]][] = [];
  let blanks = 0;
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    if (isBlank(row)) {
      if (++blanks > maxBlankRun) break;
      continue;
    }
    blanks = 0;
    if (looksLikeHeader(row) || looksLikeSectionTitle(row)) break;
    out.push([r, row]);
  }
  return out;
}

/** Key + occurrence counter so identical rows (two €61 ad top-ups on one day) stay distinct. */
function occurrenceKeys() {
  const seen = new Map<string, number>();
  return (base: string) => {
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  };
}

// ───────────────────────────── Status → pipeline stage ─────────────────────────────

const STATUS_MAP: [StageCategory, string[]][] = [
  ["DELIVERED", ["posted", "delivered", "published", "done", "live", "complete", "completed", "sent to client"]],
  ["APPROVED", ["ready to post", "ready", "approved", "confirmed", "scheduled"]],
  ["AWAITING_APPROVAL", ["awaiting approval", "waiting approval", "for approval", "sent for review", "in review", "review"]],
  ["EDITING", ["in progress", "editing", "in edit", "being edited", "started"]],
  ["FILMED", ["filmed", "shot", "footage ready"]],
  ["PLANNED", ["not started", "planned", "to do", "todo", "idea", "pending", ""]],
];

export function mapStatus(text: string | null | undefined): { category: StageCategory; known: boolean } {
  const n = norm(text);
  for (const [category, words] of STATUS_MAP) if (words.includes(n)) return { category, known: true };
  return { category: "PLANNED", known: false };
}

// ───────────────────────────── Expense categories ─────────────────────────────

export function mapExpenseCategory(sheetCategory: string, name: string): ExpenseCategory {
  const c = norm(sheetCategory);
  const n = norm(name);
  if (c === "insurance" || /\binsurance\b/.test(n)) return "OTHER";
  if (/\blens(es)?\b/.test(n)) return "LENSES_ACCESSORIES";
  if (/\beditor|\bediting\b/.test(n) || c === "editing") return "FREELANCE_EDITORS";
  if (/\b(ferry|flights?|hotel|airbnb|ryanair)\b/.test(n)) return "TRAVEL";
  if (/\b(fuel|petrol|diesel|parking|bike|tyres?|car service)\b/.test(n)) return "TRANSPORT";
  if (/\b(ads?|meta|facebook|instagram|tiktok|boost)\b/.test(n) || c === "marketing" || c === "advertising") return "MARKETING";
  if (
    /\b(adobe|google workspace|workspace|canva|capcut|claude|anthropic|chatgpt|openai|godaddy|domain|hosting|software|subscription|frame io|dropbox|icloud)\b/.test(n) ||
    c === "software"
  )
    return "SOFTWARE";
  if (c === "equipment" || /\b(camera|drone|gimbal|mic|microphone|tripod|sd card|battery|batteries|lights?)\b/.test(n)) return "CAMERA_EQUIPMENT";
  if (c === "transport") return "TRANSPORT";
  if (c === "travel") return "TRAVEL";
  if (c === "office" || c === "telecom" || /\b(phone|epic|go mobile|melita|internet)\b/.test(n)) return "OFFICE";
  return "OTHER";
}

// ───────────────────────────── Business account sheet ─────────────────────────────

export type SheetInvoiceRow = {
  number: string;
  clientName: string;
  clientType: string;
  project: string;
  amountCents: number;
  issueDate: string | null;
  dueDate: string | null;
  receivedCents: number;
  paymentDate: string | null;
  paymentStatus: string;
  notes: string;
  tab: string;
  row: number;
  tabMonth: string | null;
};

export type SheetInvoice = SheetInvoiceRow & {
  key: string;
  /** Every tab/row the invoice appeared in (an invoice is often listed again in the month it was paid). */
  seenIn: { tab: string; row: number }[];
  cancelled: boolean;
};

export type SheetExpense = {
  key: string;
  date: string;
  description: string;
  sheetCategory: string;
  category: ExpenseCategory;
  amountCents: number;
  notes: string;
  tab: string;
  row: number;
};

const INVOICE_COLS: ColumnSpec = {
  number: ["invoice number", "invoice #", "invoice no", "invoice"],
  client: ["client name", "client"],
  clientType: ["client type"],
  project: ["project name", "project"],
  amount: ["invoice amount", "amount"],
  issueDate: ["invoice date", "date"],
  dueDate: ["due date"],
  received: ["amount received", "received", "paid"],
  status: ["payment status", "status"],
  paymentDate: ["payment date", "date paid", "paid on"],
  notes: ["notes", "note"],
};

// "Category" is required so other small tables (owner withdrawals: Date · Description · Amount)
// are never mistaken for expenses.
const EXPENSE_COLS: ColumnSpec = {
  date: ["expense date", "date"],
  name: ["expense name", "expense", "item", "description"],
  category: ["category"],
  cost: ["cost", "amount"],
  notes: ["notes", "note"],
};

const EDITING_COLS: ColumnSpec = {
  datePaid: ["date paid", "date"],
  forMonth: ["for month", "month"],
  description: ["description"],
  note: ["note", "notes"],
  amount: ["amount", "cost"],
};

export type BusinessParse = {
  invoices: SheetInvoice[];
  expenses: SheetExpense[];
  /** Tabs whose tables were found. Records from a tab are only ever removed if that tab parsed. */
  parsedScopes: string[];
  issues: Issue[];
};

/** Statuses written in the "Client Type" column that are not an industry. */
const NOT_INDUSTRY = new Set(["one off", "one time", "retainer", "monthly", "package", "barter", "event"]);

export function industryFromClientType(t: string) {
  const n = norm(t);
  return n && !NOT_INDUSTRY.has(n) ? t.trim() : null;
}

export function parseBusinessAccount(tabs: Tab[]): BusinessParse {
  const issues: Issue[] = [];
  const parsedScopes: string[] = [];
  const invoiceRows: SheetInvoiceRow[] = [];
  const expenses: SheetExpense[] = [];

  for (const tab of tabs) {
    const tabMonth = monthTabStart(tab.title);

    // Editing Costs tab → editor payments as expenses.
    if (/editing cost/i.test(tab.title)) {
      const h = findHeader(tab.rows, EDITING_COLS, ["amount", "description"]);
      if (!h) {
        issues.push({ level: "warn", tab: tab.title, message: "Couldn't find the header row (Date Paid · Description · Amount). Nothing was read from this tab." });
        continue;
      }
      parsedScopes.push(`exp|${tab.title}`);
      const key = occurrenceKeys();
      for (const [r, row] of tableBody(tab.rows, h.headerRow)) {
        const rawDate = cell(row, h.cols.datePaid);
        const date = parseSheetDate(rawDate) ?? parseMonthLabel(rawDate);
        const desc = cell(row, h.cols.description);
        const forMonth = cell(row, h.cols.forMonth);
        const amount = parseAmount(cell(row, h.cols.amount));
        if (!desc && amount === null) continue;
        if (!date || amount === null || amount <= 0) {
          issues.push({ level: "warn", tab: tab.title, row: r + 1, message: `Editor payment "${desc || "(no description)"}" skipped: ${!date ? "no readable date" : "no amount"}.` });
          continue;
        }
        const monthWord = forMonth.split(/\s+/)[0]?.toLowerCase() ?? "";
        const description = forMonth && !(monthWord && desc.toLowerCase().includes(monthWord)) ? `${desc || "Editor payment"} (${forMonth})` : desc || "Editor payment";
        expenses.push({
          key: key(`exp|${tab.title}|${date}|${titleKey(description)}|${amount}`),
          date,
          description,
          sheetCategory: "Editing",
          category: "FREELANCE_EDITORS",
          amountCents: amount,
          notes: cell(row, h.cols.note),
          tab: tab.title,
          row: r + 1,
        });
      }
      continue;
    }

    if (!tabMonth) continue; // Summary, Profit, Tax… are calculated from the month tabs.

    // Invoice table
    const ih = findHeader(tab.rows, INVOICE_COLS, ["number", "client", "amount"]);
    if (ih) {
      parsedScopes.push(`inv|${tab.title}`);
      for (const [r, row] of tableBody(tab.rows, ih.headerRow)) {
        const number = cell(row, ih.cols.number);
        const clientName = cell(row, ih.cols.client);
        const amount = parseAmount(cell(row, ih.cols.amount));
        if (!number && !clientName && amount === null) continue;
        const label = `${clientName || "?"} ${amount !== null ? `€${(amount / 100).toFixed(2)}` : ""}`.trim();
        if (!number) {
          issues.push({ level: "warn", tab: tab.title, row: r + 1, message: `Invoice for ${label} skipped: no invoice number yet.` });
          continue;
        }
        if (!clientName) {
          issues.push({ level: "warn", tab: tab.title, row: r + 1, message: `Invoice ${number} skipped: no client name.` });
          continue;
        }
        if (amount === null || amount <= 0) {
          issues.push({ level: "warn", tab: tab.title, row: r + 1, message: `Invoice ${number} skipped: no invoice amount.` });
          continue;
        }
        invoiceRows.push({
          number,
          clientName,
          clientType: cell(row, ih.cols.clientType),
          project: cell(row, ih.cols.project),
          amountCents: amount,
          issueDate: parseSheetDate(cell(row, ih.cols.issueDate)),
          dueDate: parseSheetDate(cell(row, ih.cols.dueDate)),
          receivedCents: Math.max(0, parseAmount(cell(row, ih.cols.received)) ?? 0),
          paymentDate: parseSheetDate(cell(row, ih.cols.paymentDate)),
          paymentStatus: cell(row, ih.cols.status),
          notes: cell(row, ih.cols.notes),
          tab: tab.title,
          row: r + 1,
          tabMonth,
        });
      }
    } else {
      issues.push({ level: "info", tab: tab.title, message: "No invoice table found in this tab." });
    }

    // Expense table
    const eh = findHeader(tab.rows, EXPENSE_COLS, ["date", "name", "category", "cost"]);
    if (eh && (!ih || eh.headerRow !== ih.headerRow)) {
      parsedScopes.push(`exp|${tab.title}`);
      const key = occurrenceKeys();
      for (const [r, row] of tableBody(tab.rows, eh.headerRow)) {
        const rawDate = cell(row, eh.cols.date);
        const date = parseSheetDate(rawDate);
        const name = cell(row, eh.cols.name);
        const amount = parseAmount(cell(row, eh.cols.cost));
        if (!name && amount === null && !date) continue;
        const problem = !name ? "no expense name" : amount === null || amount <= 0 ? "no cost" : !date ? `date "${rawDate}" isn't readable` : null;
        if (problem) {
          issues.push({ level: "warn", tab: tab.title, row: r + 1, message: `Expense "${name || rawDate || "(empty)"}" skipped: ${problem}.` });
          continue;
        }
        const sheetCategory = cell(row, eh.cols.category);
        expenses.push({
          key: key(`exp|${tab.title}|${date}|${titleKey(name)}|${amount}`),
          date: date!,
          description: name,
          sheetCategory,
          category: mapExpenseCategory(sheetCategory, name),
          amountCents: amount!,
          notes: cell(row, eh.cols.notes),
          tab: tab.title,
          row: r + 1,
        });
      }
    } else {
      issues.push({ level: "info", tab: tab.title, message: "No expense table found in this tab." });
    }
  }

  return { invoices: mergeInvoices(invoiceRows, issues), expenses, parsedScopes, issues };
}

/**
 * The same invoice is often listed in two month tabs: once when issued (unpaid) and again
 * when paid, sometimes written as "19" instead of "SKV-0019". Rows are merged by number:
 * details come from the full-form row (or the first one), the payment from the row that
 * shows the most received.
 */
export function mergeInvoices(rows: SheetInvoiceRow[], issues: Issue[]): SheetInvoice[] {
  const groups = new Map<string, SheetInvoiceRow[]>();
  for (const r of rows) {
    const digits = invoiceDigits(r.number);
    const k = digits !== null ? `#${digits}` : r.number.toUpperCase();
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const out: SheetInvoice[] = [];
  for (const [k, group] of groups) {
    const ordered = [...group].sort((a, b) => (a.tabMonth ?? "").localeCompare(b.tabMonth ?? "") || a.row - b.row);
    const base = ordered.find((r) => /\D/.test(r.number)) ?? ordered[0]!;
    const paid = ordered.reduce((best, r) => (r.receivedCents > best.receivedCents ? r : best), ordered[0]!);
    const clients = new Set(ordered.map((r) => norm(r.clientName)));
    if (clients.size > 1) {
      issues.push({
        level: "warn",
        tab: base.tab,
        row: base.row,
        message: `Invoice number ${base.number} is used for different clients (${[...new Set(ordered.map((r) => r.clientName))].join(", ")}). Only the ${base.clientName} row was used.`,
      });
    }
    const same = ordered.filter((r) => norm(r.clientName) === norm(base.clientName));
    const amounts = new Set(same.map((r) => r.amountCents));
    if (amounts.size > 1) {
      issues.push({ level: "warn", tab: base.tab, row: base.row, message: `Invoice ${base.number} has different amounts in different tabs. Used €${(base.amountCents / 100).toFixed(2)} from ${base.tab}.` });
    }
    if (same.length > 1) {
      issues.push({ level: "info", message: `Invoice ${base.number} appears in ${same.map((r) => r.tab).join(" and ")}; merged into one invoice.` });
    }
    const payRow = same.includes(paid) ? paid : base;
    const notes = [...new Set(same.map((r) => r.notes).filter(Boolean))].join(" · ");
    out.push({
      ...base,
      key: `inv|${k}`,
      issueDate: base.issueDate ?? same.find((r) => r.issueDate)?.issueDate ?? null,
      dueDate: base.dueDate ?? same.find((r) => r.dueDate)?.dueDate ?? null,
      receivedCents: payRow.receivedCents,
      paymentDate: payRow.paymentDate,
      paymentStatus: payRow.paymentStatus || base.paymentStatus,
      notes,
      seenIn: same.map((r) => ({ tab: r.tab, row: r.row })),
      cancelled: /cancel|void|written off/i.test(payRow.paymentStatus || base.paymentStatus),
    });
  }
  return out;
}

// ───────────────────────────── Client video logbook (e.g. MS Motors) ─────────────────────────────

export type SheetVideo = {
  key: string;
  title: string;
  description: string | null;
  statusText: string;
  category: StageCategory;
  link: string | null;
  tab: string;
  row: number;
};

export type VideoParse = { videos: SheetVideo[]; parsedScopes: string[]; issues: Issue[] };

const VIDEO_LOG_COLS: ColumnSpec = {
  id: ["video #", "video", "video no", "video number", "id", "#"],
  description: ["video description", "description", "title", "video title", "content topic"],
  status: ["status"],
  notes: ["notes link", "notes", "link", "notes / link"],
};

export function parseVideoLog(tabs: Tab[]): VideoParse {
  const issues: Issue[] = [];
  const parsedScopes: string[] = [];
  const videos: SheetVideo[] = [];
  const seen = new Map<string, string>();
  for (const tab of tabs) {
    const h = findHeader(tab.rows, VIDEO_LOG_COLS, ["id", "description", "status"]);
    if (!h) continue; // other layouts (e.g. a date-based content calendar) are not a video logbook
    parsedScopes.push(`vid|${tab.title}`);
    for (const [r, row] of tableBody(tab.rows, h.headerRow, 10)) {
      const id = cell(row, h.cols.id);
      const title = cell(row, h.cols.description);
      const statusText = cell(row, h.cols.status);
      if (!id || (!title && !statusText)) continue; // numbered placeholder rows
      const key = `vid|${id.toUpperCase()}`;
      if (seen.has(key)) {
        issues.push({ level: "warn", tab: tab.title, row: r + 1, message: `${id} is listed twice (also in ${seen.get(key)}). The first one was used.` });
        continue;
      }
      seen.set(key, tab.title);
      const status = mapStatus(statusText);
      if (!status.known) issues.push({ level: "warn", tab: tab.title, row: r + 1, message: `${id}: status "${statusText}" isn't recognised, so it was put in Planned.` });
      const notes = cell(row, h.cols.notes);
      const link = /^https?:\/\//i.test(notes) ? notes : null;
      videos.push({
        key,
        title: title ? `${id} · ${title}` : id,
        description: notes && !link ? notes : null,
        statusText,
        category: status.category,
        link,
        tab: tab.title,
        row: r + 1,
      });
    }
  }
  if (!parsedScopes.length) issues.push({ level: "warn", message: "No tab with a Video # · Description · Status header was found." });
  return { videos, parsedScopes, issues };
}

// ───────────────────────────── Client content list (e.g. AUM) ─────────────────────────────

const CONTENT_COLS: ColumnSpec = {
  type: ["type", "format"],
  title: ["title", "video", "content", "description", "name", "topic"],
  status: ["status"],
};

export function parseContentList(tabs: Tab[]): VideoParse {
  const issues: Issue[] = [];
  const parsedScopes: string[] = [];
  const videos: SheetVideo[] = [];
  for (const tab of tabs) {
    if (!tab.rows.some((r) => !isBlank(r))) continue;
    const h = findHeader(tab.rows.slice(0, 10), CONTENT_COLS, ["title", "status"]);
    // Without a header the columns are Type · Title · Status.
    const cols = h?.cols ?? { type: 0, title: 1, status: 2 };
    const start = h ? h.headerRow + 1 : 0;
    parsedScopes.push(`item|${tab.title}`);
    const key = occurrenceKeys();
    for (let r = start; r < tab.rows.length; r++) {
      const row = tab.rows[r] ?? [];
      const title = cell(row, cols.title);
      if (!title) continue; // empty placeholder rows ("Post · · Not started")
      const type = cell(row, cols.type);
      const statusText = cell(row, cols.status);
      const status = mapStatus(statusText);
      if (!status.known) issues.push({ level: "warn", tab: tab.title, row: r + 1, message: `"${title}": status "${statusText}" isn't recognised, so it was put in Planned.` });
      videos.push({
        key: key(`item|${tab.title}|${titleKey(type)}|${titleKey(title)}`),
        title: type && norm(type) !== "video" ? `${title} (${type})` : title,
        description: [type, tab.title].filter(Boolean).join(" · ") || null,
        statusText,
        category: status.category,
        link: null,
        tab: tab.title,
        row: r + 1,
      });
    }
  }
  return { videos, parsedScopes, issues };
}

// ───────────────────────────── Video editing logbook ─────────────────────────────

export type EditorJob = {
  title: string;
  editor: string;
  amountCents: number | null;
  currency: string | null; // null = EUR
  statusText: string;
  tab: string;
  row: number;
};

const EDITOR_COLS: ColumnSpec = {
  title: ["video", "title", "video title", "project"],
  editor: ["editor", "edited by"],
  price: ["price", "cost", "amount"],
  status: ["status"],
  currency: ["currency"],
};

export function parseCurrency(text: string): string | null {
  const t = text.toUpperCase();
  if (!t.trim() || t.includes("EUR") || t.includes("€")) return null;
  const m = /\b([A-Z]{3})\b/.exec(t);
  if (m) return m[1]!;
  if (t.includes("$")) return "USD";
  if (t.includes("£")) return "GBP";
  return t.trim();
}

export function parseEditingLog(tabs: Tab[]): { jobs: EditorJob[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const jobs: EditorJob[] = [];
  for (const tab of tabs) {
    const h = findHeader(tab.rows.slice(0, 10), EDITOR_COLS, ["title", "editor"]);
    if (!h) {
      if (tab.rows.some((r) => !isBlank(r))) issues.push({ level: "warn", tab: tab.title, message: "Couldn't find the header row (Video · Editor · Price). Nothing was read from this tab." });
      continue;
    }
    for (let r = h.headerRow + 1; r < tab.rows.length; r++) {
      const row = tab.rows[r] ?? [];
      const title = cell(row, h.cols.title);
      const editor = cell(row, h.cols.editor);
      if (!title || !editor) continue; // nothing to record without an editor
      jobs.push({
        title,
        editor,
        amountCents: parseAmount(cell(row, h.cols.price)),
        currency: parseCurrency(cell(row, h.cols.currency)),
        statusText: cell(row, h.cols.status),
        tab: tab.title,
        row: r + 1,
      });
    }
  }
  return { jobs, issues };
}

// ───────────────────────────── Client name matching ─────────────────────────────

/** "AUM = American University of Malta" lines → Map(norm(sheet name) → app name). */
export function parseAliases(text: string | null | undefined) {
  const map = new Map<string, string>();
  for (const line of (text ?? "").split(/\r?\n/)) {
    const m = /^(.+?)\s*(?:=|→|->)\s*(.+)$/.exec(line.trim());
    if (m) map.set(norm(m[1]), m[2]!.trim());
  }
  return map;
}

/** Initials of a multi-word name, skipping filler words: "American University of Malta" → "aum". */
export function initials(name: string) {
  const words = norm(name).split(" ").filter((w) => w && !["of", "and", "the", "&", "ltd", "limited"].includes(w));
  return words.length >= 3 ? words.map((w) => w[0]).join("") : null;
}

/**
 * Find the app client a sheet name refers to: alias → exact name → company name →
 * unique acronym ("AUM"). Returns null when there's no confident match.
 */
export function matchClient<T extends { id: string; name: string; companyName: string | null }>(sheetName: string, clients: T[], aliases: Map<string, string>): T | null {
  const target = aliases.get(norm(sheetName)) ?? sheetName;
  const n = norm(target);
  const exact = clients.filter((c) => norm(c.name) === n);
  if (exact.length === 1) return exact[0]!;
  const company = clients.filter((c) => c.companyName && norm(c.companyName) === n);
  if (company.length === 1) return company[0]!;
  if (/^[a-z]{3,6}$/.test(n)) {
    const acro = clients.filter((c) => initials(c.name) === n || (c.companyName && initials(c.companyName) === n));
    if (acro.length === 1) return acro[0]!;
  }
  // The other way round: the sheet has the long name, the app the acronym.
  const sheetInitials = initials(target);
  if (sheetInitials) {
    const short = clients.filter((c) => norm(c.name) === sheetInitials);
    if (short.length === 1) return short[0]!;
  }
  return null;
}

/** Pull the spreadsheet id out of a pasted Google Sheets link (or accept a bare id). */
export function spreadsheetIdFrom(input: string): string | null {
  const s = input.trim();
  const m = /\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/.exec(s);
  if (m) return m[1]!;
  return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : null;
}
