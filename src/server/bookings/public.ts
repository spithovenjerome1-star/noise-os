"use server";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { runAction, formToObject, UserError, type ActionResult } from "../action";
import { zDate, zOpt, zReq, zId } from "../zod";
import { todayMalta, dbDateOrNull, addDaysPlain } from "@/lib/dates";
import { allowRequest } from "@/lib/domain/bookings";
import { logActivity } from "../activity";

const memoryHits = new Map<string, number[]>();

const schema = z.object({
  serviceId: zId,
  name: zReq("Your name", 120),
  company: zOpt(120),
  email: z.string({ required_error: "Email is required" }).trim().toLowerCase().email("Enter a valid email").max(200),
  phone: zOpt(40),
  preferredDate: zDate,
  preferredTime: z.preprocess((v) => (v === "" ? null : v), z.enum(["morning", "afternoon", "evening", "flexible"]).nullable().optional()).transform((v) => v ?? null),
  message: zOpt(3000),
  website: z.string().optional(), // honeypot
});

/** Public booking request. Never auto-confirmed; nothing is sent externally. */
export async function submitBookingRequest(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const settings = await db.settings.findUnique({ where: { id: 1 } });
    if (settings && !settings.publicSiteEnabled) throw new UserError("Bookings are closed right now.");
    const d = schema.parse(formToObject(fd));
    // Bots fill hidden fields. Pretend success so they don't retry.
    if (d.website && d.website.trim()) return { ok: true as const, message: "Thanks! We'll be in touch." };

    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
    const ipHash = createHash("sha256").update(`${ip}|${process.env.CRON_SECRET || "noise-book"}`).digest("hex").slice(0, 32);
    const hits = memoryHits.get(ipHash) ?? [];
    memoryHits.set(ipHash, hits);
    const recent = await db.bookingRequest.count({ where: { ipHash, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
    if (recent >= 5 || !allowRequest(hits, Date.now(), 3600_000, 5)) throw new UserError("Too many requests. Please try again later or contact us directly.");

    const today = todayMalta();
    if (d.preferredDate && (d.preferredDate < today || d.preferredDate > addDaysPlain(today, 730))) throw new UserError("Please choose a date from today onwards.");
    let serviceName: string | null = null;
    if (d.serviceId) {
      const s = await db.service.findFirst({ where: { id: d.serviceId, published: true, bookable: true }, select: { name: true } });
      if (!s) throw new UserError("That service is no longer available.");
      serviceName = s.name;
    }
    const b = await db.bookingRequest.create({
      data: { serviceId: d.serviceId, name: d.name, company: d.company, email: d.email, phone: d.phone, preferredDate: dbDateOrNull(d.preferredDate), preferredTime: d.preferredTime, message: d.message, ipHash },
    });
    await db.notification.create({
      data: {
        type: "booking.new",
        severity: "INFO",
        title: `New booking request from ${d.name}${d.company ? ` (${d.company})` : ""}`,
        body: [serviceName, d.preferredDate, d.message].filter(Boolean).join(" · ").slice(0, 300) || null,
        href: `/bookings?booking=${b.id}`,
        dedupeKey: `booking:${b.id}`,
      },
    });
    await logActivity({ actorLabel: `${d.name} (website)`, action: "booking.request", entityType: "booking", entityId: b.id, summary: `Booking request from ${d.name}${serviceName ? ` for ${serviceName}` : ""}` });
    return { ok: true as const, message: "Request sent" };
  });
}
