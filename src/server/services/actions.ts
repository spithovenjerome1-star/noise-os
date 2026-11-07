"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertUser } from "../auth";
import { runAction, formToObject, UserError, type ActionResult } from "../action";
import { zBool, zInt, zMoney, zOpt, zReq } from "../zod";
import { logActivity } from "../activity";
import { slugify, uniqueSlug } from "@/lib/domain/bookings";
import { normalizeUrl } from "@/lib/utils";

const serviceSchema = z.object({
  name: zReq("Name", 120),
  slug: zOpt(60),
  summary: zOpt(240),
  description: zOpt(4000),
  fromCents: zMoney,
  priceNote: zOpt(120),
  durationMin: zInt(0, 60 * 24),
  bookable: zBool,
  published: zBool,
});

function refresh() {
  revalidatePath("/services");
  revalidatePath("/book");
}

async function resolveSlug(requested: string | null, name: string, excludeId?: string) {
  const base = slugify(requested || name);
  const taken = await db.service.findMany({ where: { slug: { startsWith: base }, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { slug: true } });
  return uniqueSlug(base, taken.map((t) => t.slug));
}

export async function createService(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("settings:manage");
    const d = serviceSchema.parse(formToObject(fd));
    if (d.fromCents !== null && d.fromCents < 0) throw new UserError("Price can't be negative");
    const last = await db.service.findFirst({ orderBy: { position: "desc" }, select: { position: true } });
    const s = await db.service.create({ data: { ...d, slug: await resolveSlug(d.slug, d.name), durationMin: d.durationMin || null, position: (last?.position ?? -1) + 1 } });
    await logActivity({ actor: user, action: "service.create", entityType: "service", entityId: s.id, summary: `Added service “${s.name}”` });
    refresh();
    return { ok: true as const, message: "Service added" };
  });
}

export async function updateService(id: string, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("settings:manage");
    const d = serviceSchema.parse(formToObject(fd));
    if (d.fromCents !== null && d.fromCents < 0) throw new UserError("Price can't be negative");
    const s = await db.service.update({ where: { id }, data: { ...d, slug: await resolveSlug(d.slug, d.name, id), durationMin: d.durationMin || null } });
    await logActivity({ actor: user, action: "service.update", entityType: "service", entityId: id, summary: `Updated service “${s.name}”` });
    refresh();
    return { ok: true as const, message: "Service saved" };
  });
}

export async function toggleServicePublished(id: string, published: boolean): Promise<ActionResult> {
  return runAction(async () => {
    await assertUser("settings:manage");
    await db.service.update({ where: { id }, data: { published } });
    refresh();
    return { ok: true as const, message: published ? "Now visible on your booking page" : "Hidden from your booking page" };
  });
}

export async function moveService(id: string, dir: -1 | 1): Promise<ActionResult> {
  return runAction(async () => {
    await assertUser("settings:manage");
    const all = await db.service.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true } });
    const i = all.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= all.length) return { ok: true as const };
    [all[i], all[j]] = [all[j]!, all[i]!];
    await db.$transaction(all.map((s, idx) => db.service.update({ where: { id: s.id }, data: { position: idx } })));
    refresh();
    return { ok: true as const, message: "Order updated" };
  });
}

export async function deleteService(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("settings:manage");
    const s = await db.service.delete({ where: { id } });
    await logActivity({ actor: user, action: "service.delete", entityType: "service", entityId: id, summary: `Deleted service “${s.name}”` });
    refresh();
    return { ok: true as const, message: "Service deleted. Past booking requests keep their details." };
  });
}

export async function updatePublicSite(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("settings:manage");
    const d = z.object({ publicSiteEnabled: zBool, publicTagline: zOpt(160), publicAbout: zOpt(2000), instagramUrl: zOpt(200) }).parse(formToObject(fd));
    await db.settings.upsert({ where: { id: 1 }, update: { ...d, instagramUrl: normalizeUrl(d.instagramUrl) }, create: { id: 1, ...d, instagramUrl: normalizeUrl(d.instagramUrl) } });
    await logActivity({ actor: user, action: "settings.public_site", entityType: "settings", summary: `Updated public booking page${d.publicSiteEnabled ? "" : " (bookings closed)"}` });
    refresh();
    return { ok: true as const, message: "Booking page updated" };
  });
}
