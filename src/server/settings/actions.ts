"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { assertUser, hashPassword, verifyPassword, sha256 } from "@/server/auth";
import { runAction, formToObject, UserError, type ActionResult } from "@/server/action";
import { logActivity } from "@/server/activity";
import { zBool, zEmail, zInt, zOpt, zPercentBp, zReq } from "@/server/zod";
import { formatInvoiceNumber } from "@/lib/domain/invoices";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/server/auth";
import { canChangeOwnerState } from "@/lib/domain/team";

const done = (message = "Settings saved") => {
  revalidatePath("/", "layout");
  return { ok: true as const, message };
};

export async function updateBusinessSettings(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("settings:manage");
    const d = z
      .object({
        businessName: zReq("Business name", 100),
        legalName: zOpt(200),
        vatNumber: zOpt(50),
        address: zOpt(500),
        email: zEmail,
        phone: zOpt(50),
        iban: zOpt(64),
        invoicePrefix: z.string().trim().max(20).regex(/^[A-Za-z0-9\-_/]*$/, "Use letters, numbers, - _ / only"),
        nextInvoiceNumber: zInt(1, 99_999_999).refine((v) => v !== null, "Required"),
        invoicePadding: zInt(1, 8).refine((v) => v !== null, "Required"),
        defaultPaymentTerms: zInt(0, 365).refine((v) => v !== null, "Required"),
        invoiceFooter: zOpt(1000),
      })
      .parse(formToObject(fd));
    const next = formatInvoiceNumber(d.invoicePrefix, d.nextInvoiceNumber!, d.invoicePadding!);
    if (await db.invoice.findUnique({ where: { number: next } }))
      throw new UserError(`Invoice ${next} already exists — choose a higher next number so numbers stay unique.`);
    await db.settings.update({ where: { id: 1 }, data: { ...d, nextInvoiceNumber: d.nextInvoiceNumber!, invoicePadding: d.invoicePadding!, defaultPaymentTerms: d.defaultPaymentTerms! } });
    await logActivity({ actor: user, action: "settings.update", entityType: "settings", summary: "Updated business settings" });
    return done();
  });
}

export async function updateProductionSettings(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("settings:manage");
    const req = (min: number, max: number) => zInt(min, max).refine((v) => v !== null, "Required").transform((v) => v as number);
    const d = z
      .object({ defaultTurnaroundDays: req(0, 365), deadlineWarningDays: req(0, 60), approvalStaleDays: req(1, 365), inactiveClientDays: req(1, 3650) })
      .parse(formToObject(fd));
    await db.settings.update({ where: { id: 1 }, data: d });
    await logActivity({ actor: user, action: "settings.update", entityType: "settings", summary: "Updated production settings" });
    return done();
  });
}

export async function updateFinanceSettings(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("settings:manage");
    const d = z.object({ estimatedTaxRateBp: zPercentBp.refine((v) => v !== null, "Required") }).parse(formToObject(fd));
    await db.settings.update({ where: { id: 1 }, data: { estimatedTaxRateBp: d.estimatedTaxRateBp! } });
    await logActivity({ actor: user, action: "settings.update", entityType: "settings", summary: "Updated estimated tax rate" });
    return done();
  });
}

export async function saveVatRate(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("settings:manage");
    const d = z
      .object({ id: zOpt(64), name: zReq("Name", 80), rateBp: zPercentBp.refine((v) => v !== null, "Required"), note: zOpt(300), isDefault: zBool })
      .parse(formToObject(fd));
    await db.$transaction(async (tx) => {
      if (d.isDefault) await tx.vatRate.updateMany({ data: { isDefault: false } });
      const data = { name: d.name, rateBp: d.rateBp!, note: d.note, isDefault: d.isDefault };
      if (d.id) await tx.vatRate.update({ where: { id: d.id }, data });
      else await tx.vatRate.create({ data: { ...data, position: await tx.vatRate.count() } });
      if (!(await tx.vatRate.count({ where: { isDefault: true, archived: false } }))) {
        const first = await tx.vatRate.findFirst({ where: { archived: false }, orderBy: { position: "asc" } });
        if (first) await tx.vatRate.update({ where: { id: first.id }, data: { isDefault: true } });
      }
    });
    await logActivity({ actor: user, action: "vat.save", entityType: "vatRate", summary: `Saved VAT rate “${d.name}”` });
    return done("VAT rate saved");
  });
}

export async function archiveVatRate(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("settings:manage");
    const r = await db.vatRate.findUnique({ where: { id } });
    if (!r) throw new UserError("Not found");
    if (r.isDefault) throw new UserError("Choose another default rate before removing this one.");
    // Archived (not deleted): historical invoice lines keep their own stored rate.
    await db.vatRate.update({ where: { id }, data: { archived: true } });
    await logActivity({ actor: user, action: "vat.archive", entityType: "vatRate", summary: `Removed VAT rate “${r.name}”` });
    return done("VAT rate removed");
  });
}

// ───────────── Team ─────────────

const ROLES: Role[] = ["OWNER", "ADMIN", "MEMBER"];

export async function createMember(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("team:manage");
    const d = z
      .object({
        name: zReq("Name", 100),
        email: z.string().trim().toLowerCase().email("Enter a valid email"),
        role: z.enum(ROLES as [Role, ...Role[]]),
        canLogin: zBool,
        password: z.string().max(200).optional().default(""),
      })
      .parse(formToObject(fd));
    if (d.canLogin && d.password.length < 10) return { ok: false as const, error: "Please check the highlighted fields.", fieldErrors: { password: "Temporary password must be at least 10 characters" } };
    const m = await db.user.create({
      data: { name: d.name, email: d.email, role: d.role, canLogin: d.canLogin, passwordHash: d.canLogin ? await hashPassword(d.password) : null },
    });
    await logActivity({ actor: user, action: "team.add", entityType: "user", entityId: m.id, summary: `Added ${d.name} as ${d.role.toLowerCase()}` });
    return done(d.canLogin ? `${d.name} can now sign in with the temporary password` : `${d.name} added`);
  });
}

export async function updateMember(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("team:manage");
    const d = z
      .object({ id: zReq("id", 64), name: zReq("Name", 100), role: z.enum(ROLES as [Role, ...Role[]]), active: zBool, canLogin: zBool })
      .parse(formToObject(fd));
    const target = await db.user.findUnique({ where: { id: d.id } });
    if (!target) throw new UserError("User not found");
    const activeOwners = await db.user.count({ where: { role: "OWNER", active: true, canLogin: true } });
    const check = canChangeOwnerState({ target: { role: target.role, active: target.active && target.canLogin }, next: { role: d.role, active: d.active && d.canLogin }, activeOwners });
    if (!check.ok) throw new UserError(check.reason);
    if (d.canLogin && !target.passwordHash) throw new UserError("Set a password first (Reset password) before enabling sign-in.");
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: d.id }, data: { name: d.name, role: d.role, active: d.active, canLogin: d.canLogin } });
      if (!d.active || !d.canLogin) await tx.session.deleteMany({ where: { userId: d.id } });
    });
    await logActivity({ actor: user, action: "team.update", entityType: "user", entityId: d.id, summary: `Updated ${d.name} (${d.role.toLowerCase()}${d.active ? "" : ", deactivated"})` });
    return done("Team member updated");
  });
}

export async function resetMemberPassword(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("team:manage");
    const d = z.object({ id: zReq("id", 64), password: z.string().min(10, "At least 10 characters").max(200) }).parse(formToObject(fd));
    const target = await db.user.findUnique({ where: { id: d.id } });
    if (!target) throw new UserError("User not found");
    await db.$transaction([
      db.user.update({ where: { id: d.id }, data: { passwordHash: await hashPassword(d.password), canLogin: true } }),
      db.session.deleteMany({ where: { userId: d.id } }),
    ]);
    await logActivity({ actor: user, action: "team.password", entityType: "user", entityId: d.id, summary: `Reset password for ${target.name}` });
    return done("Password reset — share it with them securely");
  });
}

export async function changeOwnPassword(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser();
    const d = z
      .object({ current: z.string().min(1, "Enter your current password"), next: z.string().min(10, "At least 10 characters").max(200), confirm: z.string() })
      .refine((v) => v.next === v.confirm, { path: ["confirm"], message: "Passwords don't match" })
      .parse(formToObject(fd));
    const me = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!me.passwordHash || !(await verifyPassword(d.current, me.passwordHash)))
      return { ok: false as const, error: "Please check the highlighted fields.", fieldErrors: { current: "Current password is incorrect" } };
    const jar = await cookies();
    const keep = jar.get(SESSION_COOKIE)?.value;
    await db.$transaction([
      db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(d.next) } }),
      // Sign out other devices, keep this one.
      db.session.deleteMany({ where: { userId: user.id, ...(keep ? { id: { not: sha256(keep) } } : {}) } }),
    ]);
    await logActivity({ actor: user, action: "account.password", entityType: "user", entityId: user.id, summary: "Changed password" });
    return { ok: true as const, message: "Password changed. Other devices were signed out." };
  });
}

// ───────────── Data ─────────────

export async function removeDemoData(): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("settings:manage");
    const counts = await db.$transaction(async (tx) => {
      const demoClients = await tx.client.findMany({ where: { isDemo: true }, select: { id: true } });
      const ids = demoClients.map((c) => c.id);
      // Invoices restrict client deletion, so remove demo invoices and invoices of demo clients first.
      const inv = await tx.invoice.deleteMany({ where: { OR: [{ isDemo: true }, { clientId: { in: ids } }] } });
      const exp = await tx.expense.deleteMany({ where: { isDemo: true } });
      const tasks = await tx.task.deleteMany({ where: { isDemo: true } });
      const videos = await tx.video.deleteMany({ where: { isDemo: true } });
      const events = await tx.calendarEvent.deleteMany({ where: { isDemo: true } });
      const clients = await tx.client.deleteMany({ where: { id: { in: ids } } });
      return { invoices: inv.count, expenses: exp.count, tasks: tasks.count, videos: videos.count, events: events.count, clients: clients.count };
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    await logActivity({ actor: user, action: "data.remove-demo", entityType: "system", summary: `Removed demo data (${total} records)`, meta: counts });
    return done(total ? `Removed ${total} demo records` : "No demo data found");
  });
}
