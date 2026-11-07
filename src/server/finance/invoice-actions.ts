"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assertUser } from "../auth";
import { runAction, formToObject, UserError, type ActionResult } from "../action";
import { logActivity } from "../activity";
import { zDateReq, zId, zOpt, zMoneyReq } from "../zod";
import { dbDate, todayMalta } from "@/lib/dates";
import { formatInvoiceNumber, invoiceTotals, lineAmounts } from "@/lib/domain/invoices";
import { formatMoney, parseMoney } from "@/lib/money";

const lineSchema = z.object({
  description: z.string().trim().min(1, "Each line needs a description").max(500),
  qty: z.union([z.string(), z.number()]),
  unit: z.union([z.string(), z.number()]),
  vatRateBp: z.coerce.number().int().min(0).max(10000),
});

const invoiceSchema = z.object({
  id: zId,
  clientId: z.string({ required_error: "Choose a client" }).min(1, "Choose a client"),
  projectId: zId,
  packagePeriodId: zId,
  number: zOpt(40),
  description: zOpt(500),
  issueDate: zDateReq("Issue date"),
  dueDate: zDateReq("Due date"),
  vatNote: zOpt(500),
  notes: zOpt(5000),
  intent: z.enum(["draft", "send", "save"]).default("save"),
  lines: z.string(),
});

function parseQty(v: string | number) {
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 100000) return null;
  return Math.round(n * 100);
}

function parseLines(raw: string) {
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    throw new UserError("Invoice lines could not be read");
  }
  const lines = z.array(lineSchema).min(1, "Add at least one line").max(100).parse(arr);
  return lines.map((l, i) => {
    const qtyHundredths = parseQty(l.qty);
    const unitCents = parseMoney(l.unit as string);
    if (qtyHundredths === null) throw new UserError(`Line ${i + 1}: enter a valid quantity`);
    if (unitCents === null) throw new UserError(`Line ${i + 1}: enter a valid price`);
    const a = lineAmounts({ qtyHundredths, unitCents, vatRateBp: l.vatRateBp });
    return { description: l.description, qtyHundredths, unitCents, vatRateBp: l.vatRateBp, netCents: a.netCents, vatCents: a.vatCents, position: i };
  });
}

function revalidateFinance(id?: string) {
  revalidatePath("/invoices");
  if (id) revalidatePath(`/invoices/${id}`);
  revalidatePath("/");
  revalidatePath("/analytics");
}

async function allocateNumber(tx: Prisma.TransactionClient) {
  // Atomic increment: concurrent creations get different numbers.
  for (let attempt = 0; attempt < 50; attempt++) {
    const s = await tx.settings.update({ where: { id: 1 }, data: { nextInvoiceNumber: { increment: 1 } } });
    const n = formatInvoiceNumber(s.invoicePrefix, s.nextInvoiceNumber - 1, s.invoicePadding);
    const exists = await tx.invoice.findUnique({ where: { number: n }, select: { id: true } });
    if (!exists) return n;
  }
  throw new UserError("Couldn't allocate an invoice number. Check numbering in Settings.");
}

export async function saveInvoice(fd: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await assertUser("finance:edit");
    const d = invoiceSchema.parse(formToObject(fd));
    if (d.dueDate < d.issueDate) return { ok: false as const, error: "Due date is before the issue date.", fieldErrors: { dueDate: "Must be on or after the issue date" } };
    const lines = parseLines(d.lines);
    const totals = invoiceTotals(lines);
    const client = await db.client.findUnique({ where: { id: d.clientId }, select: { id: true, name: true } });
    if (!client) throw new UserError("Client not found");
    if (d.packagePeriodId) {
      const p = await db.packagePeriod.findUnique({ where: { id: d.packagePeriodId }, select: { package: { select: { clientId: true } } } });
      if (!p || p.package.clientId !== d.clientId) throw new UserError("That package period belongs to another client");
    }
    if (d.projectId) {
      const p = await db.project.findUnique({ where: { id: d.projectId }, select: { clientId: true } });
      if (!p || p.clientId !== d.clientId) throw new UserError("That project belongs to another client");
    }

    const base = {
      clientId: d.clientId,
      projectId: d.projectId,
      packagePeriodId: d.packagePeriodId,
      description: d.description,
      issueDate: dbDate(d.issueDate),
      dueDate: dbDate(d.dueDate),
      vatNote: d.vatNote,
      notes: d.notes,
      subtotalCents: totals.subtotalCents,
      vatCents: totals.vatCents,
      totalCents: totals.totalCents,
    };

    if (d.id) {
      const existing = await db.invoice.findUnique({ where: { id: d.id }, select: { status: true, number: true } });
      if (!existing) throw new UserError("Invoice not found");
      if (existing.status === "CANCELLED") throw new UserError("Cancelled invoices can't be edited");
      const number = d.number ?? existing.number;
      const inv = await db.$transaction(async (tx) => {
        await tx.invoiceLine.deleteMany({ where: { invoiceId: d.id! } });
        return tx.invoice.update({
          where: { id: d.id! },
          data: {
            ...base,
            number,
            ...(d.intent === "send" && existing.status === "DRAFT" ? { status: "SENT", sentAt: new Date() } : {}),
            lines: { create: lines },
          },
        });
      });
      await logActivity({ actor: user, action: "invoice.update", entityType: "invoice", entityId: inv.id, clientId: inv.clientId, summary: `Updated invoice ${inv.number} (${formatMoney(inv.totalCents)})` });
      revalidateFinance(inv.id);
      return { ok: true as const, data: { id: inv.id }, message: `Invoice ${inv.number} saved` };
    }

    const inv = await db.$transaction(async (tx) => {
      const number = d.number ?? (await allocateNumber(tx));
      return tx.invoice.create({
        data: {
          ...base,
          number,
          status: d.intent === "send" ? "SENT" : "DRAFT",
          sentAt: d.intent === "send" ? new Date() : null,
          lines: { create: lines },
        },
      });
    });
    await logActivity({
      actor: user,
      action: "invoice.create",
      entityType: "invoice",
      entityId: inv.id,
      clientId: inv.clientId,
      summary: `${inv.status === "SENT" ? "Issued" : "Drafted"} invoice ${inv.number} for ${formatMoney(inv.totalCents)}`,
    });
    revalidateFinance(inv.id);
    return { ok: true as const, data: { id: inv.id }, message: `Invoice ${inv.number} ${inv.status === "SENT" ? "issued" : "saved as draft"}` };
  });
}

async function setStatus(id: string, to: "SENT" | "DRAFT" | "CANCELLED") {
  const user = await assertUser("finance:edit");
  const inv = await db.invoice.findUnique({ where: { id }, include: { _count: { select: { payments: true } } } });
  if (!inv) throw new UserError("Invoice not found");
  if (to === "DRAFT" && inv._count.payments > 0) throw new UserError("This invoice has payments. Remove them before reverting to draft.");
  if (inv.status === "CANCELLED" && to !== "DRAFT") throw new UserError("This invoice is cancelled");
  const updated = await db.invoice.update({
    where: { id },
    data: {
      status: to,
      sentAt: to === "SENT" ? inv.sentAt ?? new Date() : to === "DRAFT" ? null : inv.sentAt,
      cancelledAt: to === "CANCELLED" ? new Date() : null,
    },
  });
  const verb = to === "SENT" ? "Marked as sent" : to === "DRAFT" ? "Reverted to draft" : "Cancelled";
  await logActivity({ actor: user, action: `invoice.${to.toLowerCase()}`, entityType: "invoice", entityId: id, clientId: inv.clientId, summary: `${verb}: invoice ${inv.number}` });
  revalidateFinance(id);
  return updated;
}

export async function markInvoiceSent(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await setStatus(id, "SENT");
    return { ok: true as const, message: "Marked as sent" };
  });
}
export async function revertInvoiceToDraft(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await setStatus(id, "DRAFT");
    return { ok: true as const, message: "Reverted to draft" };
  });
}
export async function cancelInvoice(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await setStatus(id, "CANCELLED");
    return { ok: true as const, message: "Invoice cancelled" };
  });
}

export async function deleteInvoice(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("finance:edit");
    const inv = await db.invoice.findUnique({ where: { id }, include: { _count: { select: { payments: true } } } });
    if (!inv) throw new UserError("Invoice not found");
    if (inv.status !== "DRAFT" || inv._count.payments > 0) throw new UserError("Only drafts without payments can be deleted. Cancel issued invoices instead.");
    await db.$transaction(async (tx) => {
      await tx.invoice.delete({ where: { id } });
      // If this was the most recently allocated number, release it to avoid a gap in the sequence.
      const s = await tx.settings.findUnique({ where: { id: 1 } });
      if (s && inv.number === formatInvoiceNumber(s.invoicePrefix, s.nextInvoiceNumber - 1, s.invoicePadding)) {
        await tx.settings.update({ where: { id: 1 }, data: { nextInvoiceNumber: s.nextInvoiceNumber - 1 } });
      }
    });
    await logActivity({ actor: user, action: "invoice.delete", entityType: "invoice", entityId: id, clientId: inv.clientId, summary: `Deleted draft invoice ${inv.number}` });
    revalidateFinance();
    return { ok: true as const, message: "Draft deleted" };
  });
}

export async function duplicateInvoice(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await assertUser("finance:edit");
    const src = await db.invoice.findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" } }, client: { select: { paymentTermsDays: true } } } });
    if (!src) throw new UserError("Invoice not found");
    const settings = await db.settings.findUnique({ where: { id: 1 } });
    const today = todayMalta();
    const terms = src.client.paymentTermsDays ?? settings?.defaultPaymentTerms ?? 14;
    const due = new Date(dbDate(today).getTime() + terms * 86400_000);
    const inv = await db.$transaction(async (tx) => {
      const number = await allocateNumber(tx);
      return tx.invoice.create({
        data: {
          number,
          clientId: src.clientId,
          projectId: src.projectId,
          description: src.description,
          issueDate: dbDate(today),
          dueDate: due,
          status: "DRAFT",
          subtotalCents: src.subtotalCents,
          vatCents: src.vatCents,
          totalCents: src.totalCents,
          vatNote: src.vatNote,
          lines: { create: src.lines.map(({ id: _i, invoiceId: _v, ...l }) => l) },
        },
      });
    });
    await logActivity({ actor: user, action: "invoice.duplicate", entityType: "invoice", entityId: inv.id, clientId: inv.clientId, summary: `Duplicated ${src.number} as ${inv.number}` });
    revalidateFinance();
    return { ok: true as const, data: { id: inv.id }, message: `Created draft ${inv.number}` };
  });
}

const paymentSchema = z.object({
  id: zId,
  invoiceId: z.string().min(1),
  amount: zMoneyReq("Amount"),
  paidOn: zDateReq("Payment date"),
  method: z.enum(["BANK_TRANSFER", "CASH", "CARD", "REVOLUT", "PAYPAL", "CHEQUE", "BARTER", "OTHER"]),
  reference: zOpt(200),
  notes: zOpt(2000),
});

export async function savePayment(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("finance:edit");
    const d = paymentSchema.parse(formToObject(fd));
    if (d.amount <= 0) return { ok: false as const, error: "Amount must be more than zero", fieldErrors: { amount: "Must be more than zero" } };
    const inv = await db.invoice.findUnique({ where: { id: d.invoiceId }, include: { payments: true } });
    if (!inv) throw new UserError("Invoice not found");
    if (inv.status === "CANCELLED") throw new UserError("Can't record payments on a cancelled invoice");
    const data = { amountCents: d.amount, paidOn: dbDate(d.paidOn), method: d.method, reference: d.reference, notes: d.notes };
    if (d.id) {
      if (!inv.payments.some((p) => p.id === d.id)) throw new UserError("Payment not found");
      await db.payment.update({ where: { id: d.id }, data });
    } else {
      await db.$transaction(async (tx) => {
        await tx.payment.create({ data: { ...data, invoiceId: inv.id } });
        // Recording a payment on a draft means it was issued.
        if (inv.status === "DRAFT") await tx.invoice.update({ where: { id: inv.id }, data: { status: "SENT", sentAt: inv.sentAt ?? new Date() } });
      });
    }
    const paid = inv.payments.filter((p) => p.id !== d.id).reduce((s, p) => s + p.amountCents, 0) + d.amount;
    await logActivity({
      actor: user,
      action: d.id ? "payment.update" : "payment.create",
      entityType: "invoice",
      entityId: inv.id,
      clientId: inv.clientId,
      summary: `${d.id ? "Updated payment" : "Payment received"}: ${formatMoney(d.amount)} on ${inv.number}`,
    });
    revalidateFinance(inv.id);
    const over = paid - inv.totalCents;
    return { ok: true as const, message: over > 0 ? `Saved — invoice is overpaid by ${formatMoney(over)}` : d.id ? "Payment updated" : "Payment recorded" };
  });
}

export async function deletePayment(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("finance:edit");
    const p = await db.payment.findUnique({ where: { id }, include: { invoice: { select: { id: true, number: true, clientId: true } } } });
    if (!p) throw new UserError("Payment not found");
    await db.payment.delete({ where: { id } });
    await logActivity({ actor: user, action: "payment.delete", entityType: "invoice", entityId: p.invoiceId, clientId: p.invoice.clientId, summary: `Removed payment of ${formatMoney(p.amountCents)} from ${p.invoice.number}` });
    revalidateFinance(p.invoiceId);
    return { ok: true as const, message: "Payment removed" };
  });
}

/** Data for the invoice editor when choosing a client: payment terms, projects and package periods. */
export async function invoiceClientContext(clientId: string) {
  await assertUser("finance:edit");
  const [client, settings] = await Promise.all([
    db.client.findUnique({
      where: { id: clientId },
      select: {
        paymentTermsDays: true,
        projects: { where: { status: { in: ["ACTIVE", "ON_HOLD"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } },
        packages: {
          select: { name: true, priceCents: true, periods: { orderBy: { startDate: "desc" }, take: 6, select: { id: true, startDate: true, endDate: true } } },
        },
      },
    }),
    db.settings.findUnique({ where: { id: 1 } }),
  ]);
  if (!client) return null;
  return {
    paymentTermsDays: client.paymentTermsDays ?? settings?.defaultPaymentTerms ?? 14,
    projects: client.projects,
    periods: client.packages.flatMap((p) =>
      p.periods.map((per) => ({
        id: per.id,
        label: `${p.name} · ${per.startDate.toISOString().slice(0, 10)} → ${per.endDate.toISOString().slice(0, 10)}`,
        packageName: p.name,
        priceCents: p.priceCents,
      })),
    ),
  };
}
