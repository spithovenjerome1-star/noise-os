// Google Sheets → database mirror. One run = one SheetSource, inside one transaction
// (all or nothing). "Preview" runs the same code and rolls the transaction back.
//
// Rules (also shown in Settings → Google Sheets):
//  - The sheet decides. Records that came from a sheet are updated to match it on every run.
//  - Rows are matched by a stable key (invoice number, VID-###, tab + row content).
//  - Rows the parser can't place are reported, never guessed.
//  - Records are only removed when their tab was read successfully, and never more than half at once.
//  - Invoices are never deleted automatically; a missing one is reported.
//  - Videos with app-side work (script, comments, files, tasks, time) are detached instead of deleted.
import type { Prisma, PrismaClient, SheetSource, StageCategory } from "@prisma/client";
import { addDaysPlain, dbDate, endOfMonthPlain, todayMalta } from "@/lib/dates";
import { formatInvoiceNumber, invoiceTotals, lineAmounts } from "@/lib/domain/invoices";
import {
  industryFromClientType,
  initials,
  invoiceDigits,
  matchClient,
  monthTabStart,
  parseAliases,
  parseBusinessAccount,
  parseContentList,
  parseEditingLog,
  parseVideoLog,
  titleKey,
  type Issue,
  type SheetVideo,
  type Tab,
} from "@/lib/domain/sheets";

type Tx = Prisma.TransactionClient;
type Count = { created: number; updated: number; removed: number; unchanged: number };
export type SyncCounts = Partial<Record<"clients" | "invoices" | "payments" | "expenses" | "videos" | "editors", Count>>;
export type SyncResult = { runId: string; status: "ok" | "warnings" | "error"; dryRun: boolean; counts: SyncCounts; issues: Issue[]; error?: string; summary: string };

export type Fetcher = (spreadsheetId: string) => Promise<{ title: string; tabs: Tab[] }>;

class DryRunRollback extends Error {}

const ORDER: StageCategory[] = ["PLANNED", "FILMED", "EDITING", "AWAITING_APPROVAL", "APPROVED", "DELIVERED"];

function bump(counts: SyncCounts, entity: keyof SyncCounts, what: keyof Count, n = 1) {
  const c = (counts[entity] ??= { created: 0, updated: 0, removed: 0, unchanged: 0 });
  c[what] += n;
}

const sameDate = (a: Date | null | undefined, b: Date | null | undefined) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

/** Too many removals at once usually means the sheet layout changed, not that the rows were deleted. */
function removalAllowed(stale: number, existing: number) {
  return stale <= 5 || stale <= existing / 2;
}

export function summarize(counts: SyncCounts, issues: Issue[]) {
  const parts: string[] = [];
  for (const [entity, c] of Object.entries(counts)) {
    if (!c) continue;
    const bits = [c.created && `${c.created} new`, c.updated && `${c.updated} updated`, c.removed && `${c.removed} removed`].filter(Boolean);
    if (bits.length) parts.push(`${entity}: ${bits.join(", ")}`);
  }
  const warns = issues.filter((i) => i.level === "warn").length;
  const text = parts.length ? parts.join(" · ") : "No changes";
  return warns ? `${text} · ${warns} ${warns === 1 ? "row needs" : "rows need"} attention` : text;
}

const running = new Set<string>();

export async function runSheetSync(
  db: PrismaClient,
  source: SheetSource,
  opts: { trigger: string; dryRun?: boolean; fetch: Fetcher; now?: Date },
): Promise<SyncResult> {
  const dryRun = Boolean(opts.dryRun);
  if (running.has(source.id)) throw new Error("A sync for this sheet is already running.");
  running.add(source.id);
  const run = await db.sheetSyncRun.create({ data: { sourceId: source.id, trigger: opts.trigger, dryRun } });
  const counts: SyncCounts = {};
  const issues: Issue[] = [];
  const now = opts.now ?? new Date();
  let error: string | undefined;
  try {
    const sheet = await opts.fetch(source.spreadsheetId);
    try {
      await db.$transaction(
        async (tx) => {
          const ctx = { tx, source, counts, issues, now, today: todayMalta(now) };
          if (source.kind === "BUSINESS_ACCOUNT") await applyBusiness(ctx, sheet.tabs);
          else if (source.kind === "EDITING_LOG") await applyEditingLog(ctx, sheet.tabs);
          else await applyVideos(ctx, sheet.tabs);
          if (dryRun) throw new DryRunRollback();
        },
        { timeout: 120_000, maxWait: 15_000 },
      );
    } catch (e) {
      if (!(e instanceof DryRunRollback)) throw e;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    console.error(`[sheets:${source.name}]`, e);
  } finally {
    running.delete(source.id);
  }

  const status: SyncResult["status"] = error ? "error" : issues.some((i) => i.level === "warn") ? "warnings" : "ok";
  const summary = error ? `Failed: ${error}` : summarize(counts, issues);
  await db.sheetSyncRun.update({
    where: { id: run.id },
    data: { finishedAt: new Date(), status, counts: counts as Prisma.InputJsonValue, issues: issues.slice(0, 500) as unknown as Prisma.InputJsonValue, error: error ?? null },
  });
  if (!dryRun) await db.sheetSource.update({ where: { id: source.id }, data: { lastRunAt: new Date(), lastStatus: status, lastSummary: summary.slice(0, 500) } });
  return { runId: run.id, status, dryRun, counts, issues, error, summary };
}

type Ctx = { tx: Tx; source: SheetSource; counts: SyncCounts; issues: Issue[]; now: Date; today: string };

// ───────────────────────────── Business account ─────────────────────────────

async function applyBusiness(ctx: Ctx, tabs: Tab[]) {
  const { tx, source, counts, issues } = ctx;
  const parsed = parseBusinessAccount(tabs);
  issues.push(...parsed.issues);
  if (!parsed.parsedScopes.length) {
    issues.push({ level: "warn", message: "No month tab (e.g. “November 2026”) with an invoice or expense table was found, so nothing was changed." });
    return;
  }

  const settings = await tx.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  const aliases = parseAliases(source.clientAliases);
  const clients = await tx.client.findMany({ select: { id: true, name: true, companyName: true, paymentTermsDays: true } });

  async function clientFor(name: string, clientType: string) {
    const found = matchClient(name, clients, aliases);
    if (found) return found;
    const c = await tx.client.create({
      data: { name: name.trim(), status: "ACTIVE", industry: industryFromClientType(clientType), notes: `Created by Google Sheets sync from “${source.name}”.` },
      select: { id: true, name: true, companyName: true, paymentTermsDays: true },
    });
    clients.push(c);
    bump(counts, "clients", "created");
    issues.push({ level: "info", message: `New client “${c.name}” created. If it's the same as an existing client, add a line like “${c.name} = Existing name” under client names in this sheet's settings.` });
    return c;
  }

  // ── Invoices + payments
  const allInvoices = await tx.invoice.findMany({
    select: { id: true, number: true, clientId: true, syncSourceId: true, syncKey: true, totalCents: true, issueDate: true, dueDate: true, status: true, description: true, notes: true },
  });
  const seenKeys = new Set<string>();

  for (const inv of parsed.invoices) {
    seenKeys.add(inv.key);
    const where = `${inv.number} (${inv.seenIn.map((s) => s.tab).join(", ")})`;
    let existing = allInvoices.find((i) => i.syncSourceId === source.id && i.syncKey === inv.key);
    if (!existing) {
      const exact = allInvoices.filter((i) => i.number.toUpperCase() === inv.number.toUpperCase());
      const digits = invoiceDigits(inv.number);
      const byDigits = digits === null ? [] : allInvoices.filter((i) => invoiceDigits(i.number) === digits);
      const candidates = exact.length ? exact : byDigits;
      if (candidates.length > 1) {
        issues.push({ level: "warn", tab: inv.tab, row: inv.row, message: `Invoice ${where} matches several invoices in the app (${candidates.map((c) => c.number).join(", ")}); skipped.` });
        continue;
      }
      const match = candidates[0];
      if (match && match.syncSourceId && match.syncSourceId !== source.id) {
        issues.push({ level: "warn", tab: inv.tab, row: inv.row, message: `Invoice ${match.number} is already synced from another sheet; skipped.` });
        continue;
      }
      existing = match;
    }

    const client = await clientFor(inv.clientName, inv.clientType);
    const issue = inv.issueDate ?? inv.tabMonth ?? ctx.today;
    if (!inv.issueDate) issues.push({ level: "info", tab: inv.tab, row: inv.row, message: `Invoice ${inv.number} has no invoice date; used ${issue}.` });
    const due = inv.dueDate ?? addDaysPlain(issue, client.paymentTermsDays ?? settings.defaultPaymentTerms);
    const status = inv.cancelled ? "CANCELLED" : "SENT";
    const line = { description: inv.project || "Services", qtyHundredths: 100, unitCents: inv.amountCents, vatRateBp: 0 };
    const totals = invoiceTotals([line]);
    const fields = {
      clientId: client.id,
      issueDate: dbDate(issue),
      dueDate: dbDate(due),
      status: status as "SENT" | "CANCELLED",
      description: inv.project || null,
      notes: inv.notes || null,
    };

    let invoiceId: string;
    if (!existing) {
      // A bare "24" in the sheet becomes the app's own format (e.g. SKV-0024), so numbers stay consistent.
      const digits = invoiceDigits(inv.number);
      const number = /^\d+$/.test(inv.number) && digits !== null ? formatInvoiceNumber(settings.invoicePrefix, digits, settings.invoicePadding) : inv.number;
      const created = await tx.invoice.create({
        data: {
          number,
          ...fields,
          sentAt: dbDate(issue),
          cancelledAt: inv.cancelled ? ctx.now : null,
          subtotalCents: totals.subtotalCents,
          vatCents: totals.vatCents,
          totalCents: totals.totalCents,
          syncSourceId: source.id,
          syncKey: inv.key,
          lines: { create: [{ ...line, ...lineAmounts(line), position: 0 }] },
        },
      });
      invoiceId = created.id;
      bump(counts, "invoices", "created");
    } else {
      invoiceId = existing.id;
      const changed =
        existing.clientId !== fields.clientId ||
        !sameDate(existing.issueDate, fields.issueDate) ||
        !sameDate(existing.dueDate, fields.dueDate) ||
        existing.status !== fields.status ||
        (existing.description ?? null) !== fields.description ||
        (existing.notes ?? null) !== fields.notes ||
        existing.totalCents !== totals.totalCents ||
        existing.syncSourceId !== source.id ||
        existing.syncKey !== inv.key;
      if (changed) {
        if (existing.totalCents !== totals.totalCents) {
          await tx.invoiceLine.deleteMany({ where: { invoiceId } });
          await tx.invoiceLine.create({ data: { invoiceId, ...line, ...lineAmounts(line), position: 0 } });
        }
        await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            ...fields,
            subtotalCents: totals.subtotalCents,
            vatCents: totals.vatCents,
            totalCents: totals.totalCents,
            cancelledAt: inv.cancelled ? ctx.now : null,
            syncSourceId: source.id,
            syncKey: inv.key,
          },
        });
        if (existing.clientId !== fields.clientId && existing.syncSourceId === source.id) {
          issues.push({ level: "info", tab: inv.tab, row: inv.row, message: `Invoice ${existing.number} moved to client ${client.name}, as in the sheet.` });
        }
        bump(counts, "invoices", "updated");
      } else bump(counts, "invoices", "unchanged");
    }

    // Payments: the sheet's "Amount Received" is the truth for this invoice.
    const payKey = `${inv.key}|paid`;
    const payments = await tx.payment.findMany({ where: { invoiceId } });
    const others = payments.filter((p) => !(p.syncSourceId === source.id && p.syncKey === payKey));
    if (others.length) {
      await tx.payment.deleteMany({ where: { id: { in: others.map((p) => p.id) } } });
      bump(counts, "payments", "removed", others.length);
      const manual = others.filter((p) => !p.syncSourceId).length;
      if (manual)
        issues.push({ level: "info", tab: inv.tab, row: inv.row, message: `Invoice ${inv.number}: ${manual} payment${manual === 1 ? "" : "s"} recorded in the app replaced by the amount received in the sheet.` });
    }
    const mine = payments.find((p) => p.syncSourceId === source.id && p.syncKey === payKey);
    if (inv.receivedCents > 0) {
      const paidOn = dbDate(inv.paymentDate ?? issue);
      if (!inv.paymentDate) issues.push({ level: "info", tab: inv.tab, row: inv.row, message: `Invoice ${inv.number}: amount received has no payment date; used ${issue}.` });
      if (!mine) {
        await tx.payment.create({ data: { invoiceId, amountCents: inv.receivedCents, paidOn, notes: "From Google Sheets", syncSourceId: source.id, syncKey: payKey } });
        bump(counts, "payments", "created");
      } else if (mine.amountCents !== inv.receivedCents || !sameDate(mine.paidOn, paidOn)) {
        await tx.payment.update({ where: { id: mine.id }, data: { amountCents: inv.receivedCents, paidOn } });
        bump(counts, "payments", "updated");
      } else bump(counts, "payments", "unchanged");
    } else if (mine) {
      await tx.payment.delete({ where: { id: mine.id } });
      bump(counts, "payments", "removed");
    }
  }

  // Keep the app's own invoice numbering ahead of numbers that came from the sheet.
  const prefixed = await tx.invoice.findMany({ where: { syncSourceId: source.id, number: { startsWith: settings.invoicePrefix } }, select: { number: true } });
  const highest = Math.max(0, ...prefixed.map((i) => invoiceDigits(i.number) ?? 0));
  if (highest >= settings.nextInvoiceNumber) {
    await tx.settings.update({ where: { id: 1 }, data: { nextInvoiceNumber: highest + 1 } });
    issues.push({ level: "info", message: `Next invoice number moved to ${formatInvoiceNumber(settings.invoicePrefix, highest + 1, settings.invoicePadding)} so it doesn't clash with invoices from the sheet.` });
  }

  for (const gone of allInvoices.filter((i) => i.syncSourceId === source.id && i.syncKey && !seenKeys.has(i.syncKey))) {
    issues.push({ level: "warn", message: `Invoice ${gone.number} is no longer in the sheet. It was left in the app; cancel or delete it there if it's gone for good.` });
  }

  // ── Expenses
  const existingExpenses = await tx.expense.findMany({ where: { syncSourceId: source.id } });
  const byKey = new Map(existingExpenses.map((e) => [e.syncKey, e]));
  const wanted = new Set<string>();
  for (const e of parsed.expenses) {
    wanted.add(e.key);
    const notes = [e.notes, e.sheetCategory && `Sheet category: ${e.sheetCategory}`].filter(Boolean).join(" · ") || null;
    const data = { description: e.description, amountCents: e.amountCents, vatCents: 0, vatReclaimable: false, date: dbDate(e.date), category: e.category, notes };
    const cur = byKey.get(e.key);
    if (!cur) {
      await tx.expense.create({ data: { ...data, syncSourceId: source.id, syncKey: e.key } });
      bump(counts, "expenses", "created");
    } else if (cur.description !== data.description || cur.amountCents !== data.amountCents || !sameDate(cur.date, data.date) || cur.category !== data.category || (cur.notes ?? null) !== notes) {
      await tx.expense.update({ where: { id: cur.id }, data });
      bump(counts, "expenses", "updated");
    } else bump(counts, "expenses", "unchanged");
  }
  const scopes = parsed.parsedScopes.filter((s) => s.startsWith("exp|"));
  const lostTabs = new Map<string, number>();
  for (const e of existingExpenses) {
    const tab = e.syncKey?.split("|")[1];
    if (tab && !scopes.includes(`exp|${tab}`)) lostTabs.set(tab, (lostTabs.get(tab) ?? 0) + 1);
  }
  for (const [tab, n] of lostTabs)
    issues.push({ level: "warn", tab, message: `Couldn't read the expense table in “${tab}” (was the header or tab renamed?). Its ${n} synced expense${n === 1 ? " was" : "s were"} left as they were.` });
  const stale = existingExpenses.filter((e) => e.syncKey && !wanted.has(e.syncKey) && scopes.some((s) => e.syncKey!.startsWith(`${s}|`)));
  if (stale.length) {
    if (removalAllowed(stale.length, existingExpenses.length)) {
      await tx.expense.deleteMany({ where: { id: { in: stale.map((e) => e.id) } } });
      bump(counts, "expenses", "removed", stale.length);
    } else {
      issues.push({ level: "warn", message: `${stale.length} expenses disappeared from the sheet at once, which looks like a layout change. Nothing was removed; check the sheet and sync again.` });
    }
  }
}

// ───────────────────────────── Client videos (logbook or content list) ─────────────────────────────

async function applyVideos(ctx: Ctx, tabs: Tab[]) {
  const { tx, source, counts, issues } = ctx;
  if (!source.clientId) {
    issues.push({ level: "warn", message: "Choose which client this sheet belongs to in its settings. Nothing was changed." });
    return;
  }
  const parsed = source.kind === "CLIENT_VIDEO_LOG" ? parseVideoLog(tabs) : parseContentList(tabs);
  issues.push(...parsed.issues);
  if (!parsed.parsedScopes.length) return;

  const stages = await tx.stage.findMany({ where: { archived: false }, orderBy: { position: "asc" } });
  const stageFor = (cat: StageCategory) => stages.find((s) => s.category === cat) ?? null;
  const existing = await tx.video.findMany({ where: { syncSourceId: source.id }, include: { stage: { select: { category: true } } } });
  const byKey = new Map(existing.map((v) => [v.syncKey, v]));
  const nextPos = new Map<string, number>();
  async function position(stageId: string) {
    if (!nextPos.has(stageId)) {
      const top = await tx.video.aggregate({ where: { stageId }, _max: { position: true } });
      nextPos.set(stageId, top._max.position ?? 0);
    }
    const p = nextPos.get(stageId)! + 1000;
    nextPos.set(stageId, p);
    return p;
  }

  /** First sighting of an already-finished video: date it to its month tab if that month is over, otherwise leave it unknown. */
  function initialStamp(v: SheetVideo, from: StageCategory) {
    const month = monthTabStart(v.tab);
    const end = month ? endOfMonthPlain(month) : null;
    const when = end && end < ctx.today ? dbDate(end) : null;
    return ORDER.indexOf(v.category) >= ORDER.indexOf(from) ? when : null;
  }

  const wanted = new Set<string>();
  for (const v of parsed.videos) {
    wanted.add(v.key);
    const stage = stageFor(v.category);
    if (!stage) {
      issues.push({ level: "warn", tab: v.tab, row: v.row, message: `There's no pipeline stage for ${v.category.toLowerCase().replace("_", " ")}; “${v.title}” was skipped. Add one in Production → Stages.` });
      continue;
    }
    const cur = byKey.get(v.key);
    if (!cur) {
      await tx.video.create({
        data: {
          title: v.title.slice(0, 200),
          clientId: source.clientId,
          stageId: stage.id,
          description: v.description,
          reviewUrl: v.link,
          position: await position(stage.id),
          approvedAt: initialStamp(v, "APPROVED"),
          deliveredAt: v.category === "DELIVERED" ? initialStamp(v, "DELIVERED") : null,
          syncSourceId: source.id,
          syncKey: v.key,
        },
      });
      bump(counts, "videos", "created");
      continue;
    }
    const data: Prisma.VideoUncheckedUpdateInput = {};
    if (cur.title !== v.title.slice(0, 200)) data.title = v.title.slice(0, 200);
    if (cur.clientId !== source.clientId) data.clientId = source.clientId;
    if ((cur.description ?? null) !== v.description && v.description !== null) data.description = v.description;
    if (v.link && cur.reviewUrl !== v.link) data.reviewUrl = v.link;
    // Only move when the meaning changed, so a custom stage in the same category is kept.
    if (cur.stage.category !== v.category) {
      const idx = ORDER.indexOf(v.category);
      data.stageId = stage.id;
      data.stageChangedAt = ctx.now;
      data.position = await position(stage.id);
      data.approvedAt = idx >= ORDER.indexOf("APPROVED") ? (cur.approvedAt ?? ctx.now) : null;
      data.deliveredAt = v.category === "DELIVERED" ? (cur.deliveredAt ?? ctx.now) : null;
    }
    if (Object.keys(data).length) {
      await tx.video.update({ where: { id: cur.id }, data });
      bump(counts, "videos", "updated");
    } else bump(counts, "videos", "unchanged");
  }

  const inScope = (key: string) => (key.startsWith("vid|") ? parsed.parsedScopes.length > 0 : parsed.parsedScopes.some((s) => key.startsWith(`${s}|`)));
  const stale = existing.filter((v) => v.syncKey && !wanted.has(v.syncKey) && inScope(v.syncKey));
  if (!stale.length) return;
  if (!removalAllowed(stale.length, existing.length)) {
    issues.push({ level: "warn", message: `${stale.length} videos disappeared from the sheet at once, which looks like a layout change. Nothing was removed; check the sheet and sync again.` });
    return;
  }
  for (const v of stale) {
    const [script, comments, approvals, files, tasks, time, events] = await Promise.all([
      tx.script.count({ where: { videoId: v.id } }),
      tx.videoComment.count({ where: { videoId: v.id } }),
      tx.approval.count({ where: { videoId: v.id } }),
      tx.attachment.count({ where: { videoId: v.id } }),
      tx.task.count({ where: { videoId: v.id } }),
      tx.timeEntry.count({ where: { videoId: v.id } }),
      tx.calendarEvent.count({ where: { videoId: v.id } }),
    ]);
    if (script + comments + approvals + files + tasks + time + events > 0) {
      await tx.video.update({ where: { id: v.id }, data: { syncSourceId: null, syncKey: null } });
      issues.push({ level: "info", message: `“${v.title}” is no longer in the sheet. It has work attached in the app, so it was kept and is no longer synced.` });
    } else {
      await tx.video.delete({ where: { id: v.id } });
    }
    bump(counts, "videos", "removed");
  }
}

// ───────────────────────────── Editing logbook ─────────────────────────────

async function applyEditingLog(ctx: Ctx, tabs: Tab[]) {
  const { tx, counts, issues } = ctx;
  const parsed = parseEditingLog(tabs);
  issues.push(...parsed.issues);
  const videos = await tx.video.findMany({
    where: { isDemo: false },
    select: { id: true, title: true, syncKey: true, editorName: true, editorCostCents: true, editorCurrency: true, client: { select: { name: true } } },
  });
  // Several spellings per video: "VID-004 · BMW X1" → "bmwx1"; with the client in front ("AUM Gaming").
  const index = new Map<string, Set<string>>();
  const add = (k: string, id: string) => k && index.set(k, (index.get(k) ?? new Set()).add(id));
  for (const v of videos) {
    const base = v.title.replace(/^[A-Z]{2,5}-\d+\s*·\s*/i, "").replace(/\s*\((post|reel|story|video)\)\s*$/i, "");
    add(titleKey(base), v.id);
    add(titleKey(`${v.client.name} ${base}`), v.id);
    const ini = initials(v.client.name);
    if (ini) add(titleKey(`${ini} ${base}`), v.id);
  }
  const unmatched: string[] = [];
  const latest = new Map<string, (typeof parsed.jobs)[number]>();
  for (const job of parsed.jobs) {
    const ids = index.get(titleKey(job.title));
    if (!ids || ids.size !== 1) {
      unmatched.push(ids && ids.size > 1 ? `${job.title} (several videos match)` : job.title);
      continue;
    }
    latest.set([...ids][0]!, job); // later tabs/rows win
  }
  for (const [id, job] of latest) {
    const v = videos.find((x) => x.id === id)!;
    const data = { editorName: job.editor, editorCostCents: job.amountCents, editorCurrency: job.currency };
    if (v.editorName === data.editorName && v.editorCostCents === data.editorCostCents && (v.editorCurrency ?? null) === data.editorCurrency) {
      bump(counts, "editors", "unchanged");
      continue;
    }
    await tx.video.update({ where: { id }, data });
    bump(counts, "editors", "updated");
  }
  if (unmatched.length) {
    const shown = unmatched.slice(0, 15).join(", ");
    issues.push({
      level: "info",
      message: `${unmatched.length} editing job${unmatched.length === 1 ? "" : "s"} didn't match a video in the app: ${shown}${unmatched.length > 15 ? ", …" : ""}. Use the same title as the video to link them.`,
    });
  }
}

