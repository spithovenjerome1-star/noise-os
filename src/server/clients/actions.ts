"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { dbDate, dbDateOrNull } from "@/lib/dates";
import { normalizeUrl } from "@/lib/utils";
import { assertUser } from "../auth";
import { formToObject, runAction, UserError, type ActionResult } from "../action";
import { logActivity } from "../activity";
import { zBool, zDate, zDateReq, zEmail, zId, zInt, zMoney, zOpt, zReq } from "../zod";
import { createShareLink, revokeShareLink } from "../share-links";
import { CLIENT_STATUS } from "@/lib/labels";

const clientSchema = z.object({
  name: zReq("Client name", 200),
  companyName: zOpt(200),
  contactPerson: zOpt(200),
  email: zEmail,
  phone: zOpt(50),
  whatsapp: zOpt(50),
  website: zOpt(300),
  instagram: zOpt(300),
  facebook: zOpt(300),
  tiktok: zOpt(300),
  industry: zOpt(100),
  status: z.enum(["LEAD", "ACTIVE", "PAUSED", "FORMER"]).default("LEAD"),
  valueCents: zMoney,
  packageLabel: zOpt(200),
  startedAt: zDate,
  paymentTermsDays: zInt(0, 365),
  turnaroundDays: zInt(0, 90),
  notes: zOpt(10000),
  driveUrl: zOpt(500),
  brandColors: zOpt(1000),
  brandFonts: zOpt(1000),
  brandGuidelines: zOpt(10000),
  vatNumber: zOpt(50),
  billingAddress: zOpt(1000),
});

function clientData(d: z.infer<typeof clientSchema>, canFinance: boolean) {
  const base = {
    name: d.name,
    companyName: d.companyName,
    contactPerson: d.contactPerson,
    email: d.email,
    phone: d.phone,
    whatsapp: d.whatsapp,
    website: normalizeUrl(d.website),
    instagram: d.instagram,
    facebook: d.facebook,
    tiktok: d.tiktok,
    industry: d.industry,
    status: d.status,
    packageLabel: d.packageLabel,
    startedAt: dbDateOrNull(d.startedAt),
    turnaroundDays: d.turnaroundDays,
    notes: d.notes,
    driveUrl: normalizeUrl(d.driveUrl),
    brandColors: d.brandColors,
    brandFonts: d.brandFonts,
    brandGuidelines: d.brandGuidelines,
  };
  // Commercial fields are only written by users allowed to see money.
  return canFinance
    ? { ...base, valueCents: d.valueCents, paymentTermsDays: d.paymentTermsDays, vatNumber: d.vatNumber, billingAddress: d.billingAddress }
    : base;
}

export async function createClient(fd: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await assertUser("clients:edit");
    const d = clientSchema.parse(formToObject(fd));
    const dupe = await db.client.findFirst({ where: { name: { equals: d.name, mode: "insensitive" } }, select: { id: true } });
    if (dupe && fd.get("confirmDuplicate") !== "1") throw new UserError(`A client named “${d.name}” already exists.`);
    const c = await db.client.create({ data: clientData(d, true) });
    await logActivity({ actor: user, action: "client.create", entityType: "client", entityId: c.id, clientId: c.id, summary: `Added client ${c.name}` });
    revalidatePath("/clients");
    return { ok: true as const, data: { id: c.id }, message: "Client added" };
  });
}

export async function updateClient(id: string, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("clients:edit");
    const d = clientSchema.parse(formToObject(fd));
    const before = await db.client.findUniqueOrThrow({ where: { id } });
    const c = await db.client.update({ where: { id }, data: clientData(d, true) });
    const changes: string[] = [];
    if (before.status !== c.status) changes.push(`status → ${CLIENT_STATUS[c.status].label}`);
    if (before.valueCents !== c.valueCents) changes.push("value changed");
    await logActivity({
      actor: user,
      action: "client.update",
      entityType: "client",
      entityId: id,
      clientId: id,
      summary: changes.length ? `Updated client: ${changes.join(", ")}` : "Updated client details",
    });
    revalidatePath(`/clients/${id}`);
    revalidatePath("/clients");
    return { ok: true as const, message: "Client updated" };
  });
}

export async function setClientArchived(id: string, archived: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("clients:edit");
    const c = await db.client.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    await logActivity({ actor: user, action: archived ? "client.archive" : "client.unarchive", entityType: "client", entityId: id, clientId: id, summary: archived ? "Archived client" : "Restored client from archive" });
    revalidatePath("/clients");
    revalidatePath(`/clients/${id}`);
    return { ok: true as const, message: archived ? `${c.name} archived — history kept` : `${c.name} restored` };
  });
}

export async function deleteClient(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("clients:delete");
    const invoices = await db.invoice.count({ where: { clientId: id } });
    if (invoices > 0) throw new UserError("This client has invoices. Archive the client instead to keep financial history.");
    const c = await db.client.delete({ where: { id } });
    await logActivity({ actor: user, action: "client.delete", entityType: "client", entityId: id, summary: `Deleted client ${c.name}` });
    revalidatePath("/clients");
    return { ok: true as const, message: "Client deleted" };
  });
}

// ───────── Contacts ─────────
const contactSchema = z.object({
  name: zReq("Name", 200),
  role: zOpt(100),
  email: zEmail,
  phone: zOpt(50),
  isPrimary: zBool,
});

export async function saveContact(clientId: string, contactId: string | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("clients:edit");
    const d = contactSchema.parse(formToObject(fd));
    await db.$transaction(async (tx) => {
      if (d.isPrimary) await tx.contact.updateMany({ where: { clientId }, data: { isPrimary: false } });
      if (contactId) await tx.contact.update({ where: { id: contactId, clientId }, data: d });
      else await tx.contact.create({ data: { ...d, clientId } });
    });
    await logActivity({ actor: user, action: contactId ? "contact.update" : "contact.create", entityType: "contact", clientId, summary: `${contactId ? "Updated" : "Added"} contact ${d.name}` });
    revalidatePath(`/clients/${clientId}`);
    return { ok: true as const, message: contactId ? "Contact updated" : "Contact added" };
  });
}

export async function deleteContact(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await assertUser("clients:edit");
    const c = await db.contact.delete({ where: { id } });
    revalidatePath(`/clients/${c.clientId}`);
    return { ok: true as const, message: "Contact removed" };
  });
}

// ───────── Notes ─────────
export async function saveNote(clientId: string, noteId: string | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const { body, pinned } = z.object({ body: zReq("Note", 20000), pinned: zBool }).parse(formToObject(fd));
    if (noteId) await db.clientNote.update({ where: { id: noteId, clientId }, data: { body, pinned } });
    else {
      await db.clientNote.create({ data: { clientId, body, pinned, authorId: user.id } });
      await logActivity({ actor: user, action: "note.create", entityType: "note", clientId, summary: "Added a note" });
    }
    revalidatePath(`/clients/${clientId}`);
    return { ok: true as const, message: noteId ? "Note updated" : "Note added" };
  });
}

export async function toggleNotePin(id: string, pinned: boolean): Promise<ActionResult> {
  return runAction(async () => {
    await assertUser("production:edit");
    const n = await db.clientNote.update({ where: { id }, data: { pinned } });
    revalidatePath(`/clients/${n.clientId}`);
    return { ok: true as const, message: pinned ? "Pinned" : "Unpinned" };
  });
}

export async function deleteNote(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await assertUser("production:edit");
    const n = await db.clientNote.delete({ where: { id } });
    revalidatePath(`/clients/${n.clientId}`);
    return { ok: true as const, message: "Note deleted" };
  });
}

// ───────── Projects ─────────
const projectSchema = z.object({
  name: zReq("Project name", 200),
  description: zOpt(5000),
  status: z.enum(["ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]).default("ACTIVE"),
  startDate: zDate,
  dueDate: zDate,
  budgetCents: zMoney,
});

export async function saveProject(clientId: string, projectId: string | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("clients:edit");
    const d = projectSchema.parse(formToObject(fd));
    if (d.startDate && d.dueDate && d.dueDate < d.startDate) throw new UserError("Due date is before the start date");
    const data = { name: d.name, description: d.description, status: d.status, startDate: dbDateOrNull(d.startDate), dueDate: dbDateOrNull(d.dueDate), budgetCents: d.budgetCents };
    const p = projectId ? await db.project.update({ where: { id: projectId, clientId }, data }) : await db.project.create({ data: { ...data, clientId } });
    await logActivity({ actor: user, action: projectId ? "project.update" : "project.create", entityType: "project", entityId: p.id, clientId, summary: `${projectId ? "Updated" : "Created"} project ${p.name}` });
    revalidatePath(`/clients/${clientId}`);
    return { ok: true as const, message: projectId ? "Project updated" : "Project created" };
  });
}

export async function deleteProject(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("clients:edit");
    const p = await db.project.delete({ where: { id } });
    await logActivity({ actor: user, action: "project.delete", entityType: "project", clientId: p.clientId, summary: `Deleted project ${p.name}` });
    revalidatePath(`/clients/${p.clientId}`);
    return { ok: true as const, message: "Project deleted — linked videos and invoices were kept" };
  });
}

// ───────── Time entries ─────────
const timeSchema = z.object({
  date: zDateReq("Date"),
  hours: z.preprocess((v) => (v === "" || v == null ? 0 : Number(String(v).replace(",", "."))), z.number().min(0).max(24)),
  minutes: z.preprocess((v) => (v === "" || v == null ? 0 : Number(v)), z.number().int().min(0).max(59)),
  note: zOpt(1000),
  videoId: zId,
});

export async function saveTimeEntry(clientId: string, entryId: string | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const d = timeSchema.parse(formToObject(fd));
    const minutes = Math.round(d.hours * 60) + d.minutes;
    if (minutes <= 0) return { ok: false as const, error: "Enter the time spent", fieldErrors: { hours: "Enter hours or minutes" } };
    if (d.videoId) {
      const v = await db.video.findUnique({ where: { id: d.videoId }, select: { clientId: true } });
      if (v?.clientId !== clientId) throw new UserError("That video belongs to another client");
    }
    const data = { date: dbDate(d.date), minutes, note: d.note, videoId: d.videoId };
    if (entryId) await db.timeEntry.update({ where: { id: entryId, clientId }, data });
    else await db.timeEntry.create({ data: { ...data, clientId, userId: user.id } });
    revalidatePath(`/clients/${clientId}`);
    return { ok: true as const, message: entryId ? "Time updated" : "Time logged" };
  });
}

export async function deleteTimeEntry(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await assertUser("production:edit");
    const t = await db.timeEntry.delete({ where: { id } });
    revalidatePath(`/clients/${t.clientId}`);
    return { ok: true as const, message: "Time entry removed" };
  });
}

// ───────── Client portal links ─────────
export async function createPortalLink(clientId: string, fd: FormData): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const user = await assertUser("clients:edit");
    const d = z.object({ label: zOpt(100), expiresInDays: zInt(1, 3650) }).parse(formToObject(fd));
    const { url, link } = await createShareLink({ scope: "CLIENT_PORTAL", clientId, label: d.label, expiresInDays: d.expiresInDays, createdById: user.id });
    await logActivity({ actor: user, action: "portal.link.create", entityType: "shareLink", entityId: link.id, clientId, summary: `Created client portal link${d.label ? ` “${d.label}”` : ""}` });
    revalidatePath(`/clients/${clientId}`);
    return { ok: true as const, data: { url }, message: "Portal link created" };
  });
}

export async function revokePortalLink(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("clients:edit");
    const l = await revokeShareLink(id);
    await logActivity({ actor: user, action: "portal.link.revoke", entityType: "shareLink", entityId: id, clientId: l.clientId, summary: "Revoked a client portal link" });
    revalidatePath(`/clients/${l.clientId}`);
    return { ok: true as const, message: "Link revoked — it no longer works" };
  });
}
