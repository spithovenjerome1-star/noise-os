"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertUser } from "../auth";
import { runAction, formToObject, UserError, type ActionResult } from "../action";
import { logActivity } from "../activity";
import { zBool, zDate, zDateReq, zId, zInt, zMoney, zMoneyReq, zOpt, zReq } from "../zod";
import { dbDate, dbDateOrNull, todayMalta } from "@/lib/dates";
import { formatMoney, splitGross } from "@/lib/money";
import { deleteFile } from "../storage";
import { generateRecurringExpenses } from "./recurring";

const CATEGORIES = ["CAMERA_EQUIPMENT", "LENSES_ACCESSORIES", "SOFTWARE", "FREELANCE_EDITORS", "TRANSPORT", "VEHICLE", "MARKETING", "OFFICE", "TRAVEL", "OTHER"] as const;
const METHODS = ["BANK_TRANSFER", "CASH", "CARD", "REVOLUT", "PAYPAL", "CHEQUE", "BARTER", "OTHER"] as const;

const vatFields = {
  amount: zMoneyReq("Amount"),
  vatMode: z.string().default("rate:0"), // "rate:<bp>" or "manual"
  vatAmount: zMoney,
};

/** Resolve VAT for a gross amount from the form's VAT mode. */
function resolveVat(amount: number, vatMode: string, vatAmount: number | null) {
  if (vatMode === "manual") {
    const v = vatAmount ?? 0;
    if (v < 0 || v > amount) throw new UserError("VAT can't be more than the total amount");
    return { vatCents: v, vatRateBp: null as number | null };
  }
  const bp = Number(vatMode.replace("rate:", ""));
  if (!Number.isInteger(bp) || bp < 0 || bp > 10000) throw new UserError("Invalid VAT rate");
  return { vatCents: splitGross(amount, bp).vatCents, vatRateBp: bp };
}

const expenseSchema = z.object({
  id: zId,
  description: zReq("Description", 300),
  ...vatFields,
  vatReclaimable: zBool,
  date: zDateReq("Date"),
  category: z.enum(CATEGORIES),
  vendor: zOpt(200),
  clientId: zId,
  projectId: zId,
  paymentMethod: z.enum(METHODS),
  businessUsePct: zInt(0, 100),
  notes: zOpt(5000),
});

function revalidateExpenses() {
  revalidatePath("/expenses");
  revalidatePath("/");
  revalidatePath("/analytics");
}

export async function saveExpense(fd: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await assertUser("finance:edit");
    const d = expenseSchema.parse(formToObject(fd));
    if (d.amount <= 0) return { ok: false as const, error: "Amount must be more than zero", fieldErrors: { amount: "Must be more than zero" } };
    const vat = resolveVat(d.amount, d.vatMode, d.vatAmount);
    if (d.projectId) {
      const p = await db.project.findUnique({ where: { id: d.projectId }, select: { clientId: true } });
      if (!p) throw new UserError("Project not found");
      if (d.clientId && p.clientId !== d.clientId) throw new UserError("That project belongs to another client");
      d.clientId = p.clientId;
    }
    const data = {
      description: d.description,
      amountCents: d.amount,
      vatCents: vat.vatCents,
      vatRateBp: vat.vatRateBp,
      vatReclaimable: vat.vatCents > 0 ? d.vatReclaimable : false,
      date: dbDate(d.date),
      category: d.category,
      vendor: d.vendor,
      clientId: d.clientId,
      projectId: d.projectId,
      paymentMethod: d.paymentMethod,
      businessUsePct: d.businessUsePct ?? 100,
      notes: d.notes,
    };
    const e = d.id ? await db.expense.update({ where: { id: d.id }, data }) : await db.expense.create({ data });
    await logActivity({
      actor: user,
      action: d.id ? "expense.update" : "expense.create",
      entityType: "expense",
      entityId: e.id,
      clientId: e.clientId,
      summary: `${d.id ? "Updated" : "Added"} expense: ${e.description} (${formatMoney(e.amountCents)})`,
    });
    revalidateExpenses();
    return { ok: true as const, data: { id: e.id }, message: d.id ? "Expense updated" : "Expense added" };
  });
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("finance:edit");
    const e = await db.expense.findUnique({ where: { id }, include: { attachments: true } });
    if (!e) throw new UserError("Expense not found");
    await db.expense.delete({ where: { id } });
    await Promise.all(e.attachments.map((a) => deleteFile(a.storageKey)));
    await logActivity({ actor: user, action: "expense.delete", entityType: "expense", entityId: id, clientId: e.clientId, summary: `Deleted expense: ${e.description} (${formatMoney(e.amountCents)})` });
    revalidateExpenses();
    return { ok: true as const, message: "Expense deleted" };
  });
}

const recurringSchema = z.object({
  id: zId,
  description: zReq("Description", 300),
  ...vatFields,
  category: z.enum(CATEGORIES),
  vendor: zOpt(200),
  interval: z.enum(["WEEKLY", "MONTHLY", "YEARLY"]),
  nextDate: zDateReq("Next date"),
  endDate: zDate,
  paymentMethod: z.enum(METHODS),
  businessUsePct: zInt(0, 100),
  active: zBool,
});

export async function saveRecurringExpense(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("finance:edit");
    const d = recurringSchema.parse(formToObject(fd));
    if (d.amount <= 0) return { ok: false as const, error: "Amount must be more than zero", fieldErrors: { amount: "Must be more than zero" } };
    if (d.endDate && d.endDate < d.nextDate) return { ok: false as const, error: "End date is before the next date", fieldErrors: { endDate: "Must be after the next date" } };
    const vat = resolveVat(d.amount, d.vatMode, d.vatAmount);
    const data = {
      description: d.description,
      amountCents: d.amount,
      vatCents: vat.vatCents,
      category: d.category,
      vendor: d.vendor,
      interval: d.interval,
      nextDate: dbDate(d.nextDate),
      endDate: dbDateOrNull(d.endDate),
      paymentMethod: d.paymentMethod,
      businessUsePct: d.businessUsePct ?? 100,
      active: d.active,
    };
    const r = d.id ? await db.recurringExpense.update({ where: { id: d.id }, data }) : await db.recurringExpense.create({ data });
    await logActivity({ actor: user, action: d.id ? "recurring.update" : "recurring.create", entityType: "recurringExpense", entityId: r.id, summary: `${d.id ? "Updated" : "Created"} recurring expense: ${r.description}` });
    // Generate anything already due (idempotent).
    const { created } = await generateRecurringExpenses(todayMalta());
    revalidateExpenses();
    return { ok: true as const, message: created ? `Saved — ${created} due ${created === 1 ? "expense" : "expenses"} recorded` : "Recurring expense saved" };
  });
}

export async function deleteRecurringExpense(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("finance:edit");
    const r = await db.recurringExpense.delete({ where: { id } });
    await logActivity({ actor: user, action: "recurring.delete", entityType: "recurringExpense", entityId: id, summary: `Deleted recurring expense: ${r.description} (past expenses kept)` });
    revalidateExpenses();
    return { ok: true as const, message: "Recurring expense removed. Past expenses were kept." };
  });
}

export async function runRecurringNow(): Promise<ActionResult> {
  return runAction(async () => {
    await assertUser("finance:edit");
    const { created } = await generateRecurringExpenses(todayMalta());
    revalidateExpenses();
    return { ok: true as const, message: created ? `${created} ${created === 1 ? "expense" : "expenses"} recorded` : "Nothing due" };
  });
}
