"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertUser } from "../auth";
import { runAction, formToObject, UserError, type ActionResult } from "../action";
import { zBool, zDate, zInt, zOpt } from "../zod";
import { logActivity } from "../activity";
import { maltaLocalToUtc } from "@/lib/dates";

function refresh() {
  revalidatePath("/bookings");
  revalidatePath("/", "layout");
}

async function resolveNotice(bookingId: string) {
  await db.notification.updateMany({ where: { dedupeKey: `booking:${bookingId}`, resolvedAt: null }, data: { resolvedAt: new Date(), readAt: new Date() } });
}

export async function confirmBooking(id: string, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const d = z
      .object({
        createClient: zBool,
        eventType: z.enum(["NONE", "SHOOT", "MEETING"]).default("NONE"),
        date: zDate,
        time: z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^\d{2}:\d{2}$/, "Enter a time").nullable().optional()).transform((v) => v ?? null),
        durationMin: zInt(15, 60 * 24),
        title: zOpt(200),
        location: zOpt(200),
      })
      .parse(formToObject(fd));
    if (d.eventType !== "NONE" && (!d.date || !d.time)) throw new UserError("Choose a date and time for the calendar event.");
    const result = await db.$transaction(async (tx) => {
      const b = await tx.bookingRequest.findUniqueOrThrow({ where: { id }, include: { service: { select: { name: true, durationMin: true } } } });
      if (b.status === "CONFIRMED") throw new UserError("This booking is already confirmed.");
      let clientId = b.clientId;
      let createdClient = false;
      if (!clientId) {
        const existing = await tx.client.findFirst({ where: { email: { equals: b.email, mode: "insensitive" } }, select: { id: true } });
        if (existing) clientId = existing.id;
        else if (d.createClient) {
          const c = await tx.client.create({
            data: { name: b.company || b.name, companyName: b.company, contactPerson: b.name, email: b.email, phone: b.phone, whatsapp: b.phone, status: "LEAD", notes: b.message ? `From booking request:\n${b.message}` : null },
          });
          clientId = c.id;
          createdClient = true;
        }
      }
      let eventId = b.eventId;
      if (d.eventType !== "NONE" && d.date && d.time) {
        const startsAt = maltaLocalToUtc(`${d.date}T${d.time}`);
        const minutes = d.durationMin ?? b.service?.durationMin ?? 60;
        const ev = await tx.calendarEvent.create({
          data: {
            title: d.title || `${d.eventType === "SHOOT" ? "Shoot" : "Meeting"} — ${b.company || b.name}`,
            type: d.eventType,
            startsAt,
            endsAt: new Date(startsAt.getTime() + minutes * 60_000),
            location: d.location,
            notes: [b.service?.name && `Service: ${b.service.name}`, `Booked by ${b.name} <${b.email}>${b.phone ? ` · ${b.phone}` : ""}`, b.message].filter(Boolean).join("\n"),
            clientId,
          },
        });
        eventId = ev.id;
      }
      await tx.bookingRequest.update({ where: { id }, data: { status: "CONFIRMED", clientId, eventId } });
      await logActivity(
        { actor: user, action: "booking.confirm", entityType: "booking", entityId: id, clientId, summary: `Confirmed booking from ${b.name}${createdClient ? " (new lead client created)" : ""}${eventId && eventId !== b.eventId ? " and added it to the calendar" : ""}` },
        tx,
      );
      return { clientId, eventId };
    });
    await resolveNotice(id);
    refresh();
    return { ok: true as const, data: result, message: "Booking confirmed. Remember to let them know — nothing is sent automatically." };
  });
}

export async function setBookingStatus(id: string, status: "DECLINED" | "CANCELLED" | "NEW"): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    if (!["DECLINED", "CANCELLED", "NEW"].includes(status)) throw new UserError("Unknown status");
    const b = await db.bookingRequest.update({ where: { id }, data: { status } });
    await logActivity({ actor: user, action: `booking.${status.toLowerCase()}`, entityType: "booking", entityId: id, clientId: b.clientId, summary: `Marked booking from ${b.name} as ${status.toLowerCase()}` });
    if (status !== "NEW") await resolveNotice(id);
    refresh();
    return { ok: true as const, message: status === "NEW" ? "Booking reopened" : `Booking ${status.toLowerCase()}` };
  });
}

export async function deleteBooking(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const b = await db.bookingRequest.delete({ where: { id } });
    await db.notification.deleteMany({ where: { dedupeKey: `booking:${id}` } });
    await logActivity({ actor: user, action: "booking.delete", entityType: "booking", entityId: id, summary: `Deleted booking request from ${b.name}` });
    refresh();
    return { ok: true as const, message: "Booking request deleted" };
  });
}
