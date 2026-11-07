"use server";
// Calendar events. Integration seam for Google Calendar: events keep externalSource/externalId,
// which a future sync job can use to upsert/delete remote events. Nothing here talks to Google yet.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { EventType } from "@prisma/client";
import { db } from "@/lib/db";
import { assertUser } from "@/server/auth";
import { runAction, formToObject, UserError, type ActionResult } from "@/server/action";
import { logActivity } from "@/server/activity";
import { zBool, zDate, zDateTime, zId, zOpt, zReq } from "@/server/zod";
import { addDaysPlain, maltaLocalToUtc, fmtMoment } from "@/lib/dates";

const TYPES: EventType[] = ["SHOOT", "MEETING", "MILESTONE", "DELIVERY", "OTHER"];

const schema = z.object({
  id: zId,
  title: zReq("Title", 200),
  type: z.enum(TYPES as [EventType, ...EventType[]]),
  allDay: zBool,
  startDate: zDate,
  endDate: zDate,
  startsAt: zDateTime,
  endsAt: zDateTime,
  location: zOpt(300),
  clientId: zId,
  projectId: zId,
  videoId: zId,
  notes: zOpt(5000),
  allowConflict: zBool,
  equipmentIds: z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(z.string().max(64)).max(50)),
});

export async function saveEvent(fd: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async (): Promise<ActionResult<{ id: string }>> => {
    const user = await assertUser("production:edit");
    const d = schema.parse(formToObject(fd));
    let startsAt: Date;
    let endsAt: Date;
    if (d.allDay) {
      if (!d.startDate) return { ok: false as const, error: "Please check the highlighted fields.", fieldErrors: { startDate: "Choose a date" } };
      const end = d.endDate ?? d.startDate;
      if (end < d.startDate) return { ok: false as const, error: "Please check the highlighted fields.", fieldErrors: { endDate: "End must be on or after the start" } };
      // All-day events are stored as Malta midnight → midnight after the last day (exclusive end).
      startsAt = maltaLocalToUtc(`${d.startDate}T00:00`);
      endsAt = maltaLocalToUtc(`${addDaysPlain(end, 1)}T00:00`);
    } else {
      if (!d.startsAt) return { ok: false as const, error: "Please check the highlighted fields.", fieldErrors: { startsAt: "Choose a start time" } };
      startsAt = maltaLocalToUtc(d.startsAt);
      endsAt = d.endsAt ? maltaLocalToUtc(d.endsAt) : new Date(startsAt.getTime() + 60 * 60_000);
      if (endsAt <= startsAt) return { ok: false as const, error: "Please check the highlighted fields.", fieldErrors: { endsAt: "End must be after the start" } };
    }

    // Keep links consistent: project/video must belong to the chosen client.
    let clientId = d.clientId;
    if (d.videoId) {
      const v = await db.video.findUnique({ where: { id: d.videoId }, select: { clientId: true } });
      if (!v) throw new UserError("That video no longer exists");
      if (clientId && v.clientId !== clientId) return { ok: false as const, error: "Please check the highlighted fields.", fieldErrors: { videoId: "This video belongs to another client" } };
      clientId = v.clientId;
    }
    if (d.projectId) {
      const p = await db.project.findUnique({ where: { id: d.projectId }, select: { clientId: true } });
      if (!p) throw new UserError("That project no longer exists");
      if (clientId && p.clientId !== clientId) return { ok: false as const, error: "Please check the highlighted fields.", fieldErrors: { projectId: "This project belongs to another client" } };
      clientId = p.clientId;
    }

    if (d.equipmentIds.length) {
      const gear = await db.equipment.findMany({ where: { id: { in: d.equipmentIds } }, select: { id: true, name: true, status: true } });
      const retired = gear.filter((g) => g.status === "RETIRED");
      if (retired.length) return { ok: false as const, error: "Please check the highlighted fields.", fieldErrors: { equipment: `${retired.map((g) => g.name).join(", ")} is retired` } };
      if (!d.allowConflict) {
        const clashes = await db.eventEquipment.findMany({
          where: {
            equipmentId: { in: d.equipmentIds },
            event: { startsAt: { lt: endsAt }, endsAt: { gt: startsAt }, ...(d.id ? { id: { not: d.id } } : {}) },
          },
          include: { equipment: { select: { name: true } }, event: { select: { title: true, startsAt: true } } },
        });
        const repair = gear.filter((g) => g.status === "IN_REPAIR");
        const msgs = [
          ...clashes.map((c) => `${c.equipment.name} is booked for “${c.event.title}” (${fmtMoment(c.event.startsAt, "d MMM HH:mm")})`),
          ...repair.map((g) => `${g.name} is marked as in repair`),
        ];
        if (msgs.length)
          return { ok: false as const, error: "Equipment conflict — tick “Book anyway” to keep it.", fieldErrors: { equipment: msgs.join(" · ") } };
      }
    }

    const data = { title: d.title, type: d.type, allDay: d.allDay, startsAt, endsAt, location: d.location, notes: d.notes, clientId, projectId: d.projectId, videoId: d.videoId };
    const ev = await db.$transaction(async (tx) => {
      const e = d.id ? await tx.calendarEvent.update({ where: { id: d.id }, data }) : await tx.calendarEvent.create({ data });
      await tx.eventEquipment.deleteMany({ where: { eventId: e.id } });
      if (d.equipmentIds.length) await tx.eventEquipment.createMany({ data: [...new Set(d.equipmentIds)].map((equipmentId) => ({ eventId: e.id, equipmentId })) });
      return e;
    });
    await logActivity({
      actor: user,
      action: d.id ? "event.update" : "event.create",
      entityType: "event",
      entityId: ev.id,
      clientId,
      summary: `${d.id ? "Updated" : "Scheduled"} ${d.type === "SHOOT" ? "shoot" : "event"} “${d.title}” on ${fmtMoment(startsAt, d.allDay ? "d MMM" : "d MMM HH:mm")}`,
    });
    revalidatePath("/calendar");
    revalidatePath("/", "layout");
    return { ok: true as const, data: { id: ev.id }, message: d.id ? "Event updated" : "Event scheduled" };
  });
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const e = await db.calendarEvent.findUnique({ where: { id } });
    if (!e) throw new UserError("Event not found");
    await db.calendarEvent.delete({ where: { id } });
    await logActivity({ actor: user, action: "event.delete", entityType: "event", entityId: id, clientId: e.clientId, summary: `Deleted event “${e.title}”` });
    revalidatePath("/calendar");
    revalidatePath("/", "layout");
    return { ok: true as const, message: "Event deleted" };
  });
}
