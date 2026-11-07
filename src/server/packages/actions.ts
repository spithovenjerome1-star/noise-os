"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { addDaysPlain, dbDate, dbDateOrNull, plainOf, todayMalta } from "@/lib/dates";
import { isRecurring, monthlyPeriodEnd } from "@/lib/domain/packages";
import { assertUser } from "../auth";
import { formToObject, runAction, UserError, type ActionResult } from "../action";
import { logActivity } from "../activity";
import { zBool, zDate, zDateReq, zInt, zMoney, zOpt, zReq } from "../zod";
import { closePeriodWithRollover, ensurePeriodsForPackage, singlePeriodEnd } from "./periods";

const pkgSchema = z
  .object({
    clientId: zReq("Client", 64),
    name: zReq("Package name", 200),
    type: z.enum(["MONTHLY_RETAINER", "ONE_OFF", "EVENT", "BUNDLE", "HOURLY", "BARTER"]),
    videosIncluded: zInt(0, 1000),
    priceCents: zMoney,
    hourlyRateCents: zMoney,
    startDate: zDateReq("Start date"),
    endDate: zDate,
    active: zBool,
    autoRenew: zBool,
    rolloverPolicy: z.enum(["NONE", "ROLLOVER_ALL", "ROLLOVER_CAPPED"]).default("NONE"),
    rolloverCap: zInt(0, 1000),
    turnaroundDays: zInt(0, 90),
    barterTerms: zOpt(5000),
    notes: zOpt(5000),
  })
  .superRefine((d, ctx) => {
    if (d.endDate && d.endDate < d.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date is before the start date" });
    if (d.rolloverPolicy === "ROLLOVER_CAPPED" && (d.rolloverCap === null || d.rolloverCap === undefined))
      ctx.addIssue({ code: "custom", path: ["rolloverCap"], message: "Set the maximum number of videos to roll over" });
    if (d.type === "HOURLY" && !d.hourlyRateCents) ctx.addIssue({ code: "custom", path: ["hourlyRateCents"], message: "Set the hourly rate" });
    if (d.type === "BARTER" && !d.barterTerms) ctx.addIssue({ code: "custom", path: ["barterTerms"], message: "Describe what is exchanged" });
  });

function pkgData(d: z.infer<typeof pkgSchema>) {
  return {
    clientId: d.clientId,
    name: d.name,
    type: d.type,
    videosIncluded: d.videosIncluded,
    priceCents: d.priceCents ?? 0,
    hourlyRateCents: d.type === "HOURLY" ? d.hourlyRateCents : null,
    startDate: dbDate(d.startDate),
    endDate: dbDateOrNull(d.endDate),
    active: d.active,
    autoRenew: isRecurring(d.type) ? d.autoRenew : false,
    rolloverPolicy: isRecurring(d.type) ? d.rolloverPolicy : "NONE",
    rolloverCap: d.rolloverPolicy === "ROLLOVER_CAPPED" ? d.rolloverCap : null,
    turnaroundDays: d.turnaroundDays,
    barterTerms: d.type === "BARTER" ? d.barterTerms : null,
    notes: d.notes,
  } as const;
}

export async function createPackage(fd: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await assertUser("clients:edit");
    const d = pkgSchema.parse(formToObject(fd));
    const p = await db.servicePackage.create({ data: pkgData(d) });
    await ensurePeriodsForPackage(p.id);
    await logActivity({ actor: user, action: "package.create", entityType: "package", entityId: p.id, clientId: p.clientId, summary: `Created package ${p.name}` });
    revalidatePath("/packages");
    revalidatePath(`/clients/${p.clientId}`);
    return { ok: true as const, data: { id: p.id }, message: "Package created" };
  });
}

export async function updatePackage(id: string, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("clients:edit");
    const d = pkgSchema.parse(formToObject(fd));
    const before = await db.servicePackage.findUniqueOrThrow({ where: { id } });
    if (before.clientId !== d.clientId) {
      const linked = await db.video.count({ where: { packagePeriod: { packageId: id } } });
      if (linked) throw new UserError("This package already has videos. Create a new package for the other client instead.");
    }
    const p = await db.servicePackage.update({ where: { id }, data: pkgData(d) });
    // Keep the open (current/future) periods' included count in sync with the package; closed periods are history.
    if (before.videosIncluded !== p.videosIncluded) {
      await db.packagePeriod.updateMany({ where: { packageId: id, status: "OPEN" }, data: { videosIncluded: p.videosIncluded ?? 0 } });
    }
    // Non-recurring: the single period follows the package dates.
    if (!isRecurring(p.type)) {
      const periods = await db.packagePeriod.findMany({ where: { packageId: id }, orderBy: { startDate: "asc" } });
      if (periods.length === 1) {
        await db.packagePeriod.update({
          where: { id: periods[0]!.id },
          data: { startDate: p.startDate, endDate: dbDate(singlePeriodEnd(plainOf(p.startDate)!, plainOf(p.endDate))) },
        });
      }
    }
    await ensurePeriodsForPackage(id);
    await logActivity({ actor: user, action: "package.update", entityType: "package", entityId: id, clientId: p.clientId, summary: `Updated package ${p.name}` });
    revalidatePath("/packages");
    revalidatePath(`/packages/${id}`);
    revalidatePath(`/clients/${p.clientId}`);
    return { ok: true as const, message: "Package updated" };
  });
}

export async function deletePackage(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("clients:edit");
    const [videos, invoices] = await Promise.all([
      db.video.count({ where: { packagePeriod: { packageId: id } } }),
      db.invoice.count({ where: { packagePeriod: { packageId: id } } }),
    ]);
    if (videos || invoices) throw new UserError("This package has videos or invoices linked. Mark it inactive instead to keep history.");
    const p = await db.servicePackage.delete({ where: { id } });
    await logActivity({ actor: user, action: "package.delete", entityType: "package", clientId: p.clientId, summary: `Deleted package ${p.name}` });
    revalidatePath("/packages");
    revalidatePath(`/clients/${p.clientId}`);
    return { ok: true as const, message: "Package deleted" };
  });
}

export async function closePeriod(periodId: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("clients:edit");
    const period = await db.packagePeriod.findUniqueOrThrow({ where: { id: periodId }, include: { package: true } });
    if (period.status === "CLOSED") throw new UserError("This period is already closed");
    const r = await closePeriodWithRollover(periodId);
    await logActivity({
      actor: user,
      action: "period.close",
      entityType: "packagePeriod",
      entityId: periodId,
      clientId: period.package.clientId,
      summary: `Closed ${period.package.name} period (${plainOf(period.startDate)} → ${plainOf(period.endDate)}), ${r.remaining} undelivered${r.rollover ? `, ${r.rollover} rolled over` : ""}`,
    });
    revalidatePath(`/packages/${period.packageId}`);
    revalidatePath("/packages");
    return {
      ok: true as const,
      message: r.rollover ? (r.nextId ? `Closed — ${r.rollover} video(s) rolled into the next period` : `Closed — ${r.rollover} video(s) will roll over when the next period is created`) : "Period closed",
    };
  });
}

export async function reopenPeriod(periodId: string): Promise<ActionResult> {
  return runAction(async () => {
    await assertUser("clients:edit");
    const p = await db.packagePeriod.update({ where: { id: periodId }, data: { status: "OPEN", closedAt: null } });
    revalidatePath(`/packages/${p.packageId}`);
    return { ok: true as const, message: "Period reopened" };
  });
}

/** Manually create the period after the latest one (monthly cadence for retainers; custom range otherwise). */
export async function createNextPeriod(packageId: string, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("clients:edit");
    const pkg = await db.servicePackage.findUniqueOrThrow({ where: { id: packageId }, include: { periods: { orderBy: { startDate: "desc" }, take: 1 } } });
    const last = pkg.periods[0];
    const d = z.object({ startDate: zDate, endDate: zDate, videosIncluded: zInt(0, 1000), rolledOverIn: zInt(0, 1000) }).parse(formToObject(fd));
    const start = d.startDate ?? (last ? addDaysPlain(plainOf(last.endDate)!, 1) : plainOf(pkg.startDate)!);
    const end = d.endDate ?? monthlyPeriodEnd(plainOf(pkg.startDate)!, start);
    if (end < start) return { ok: false as const, error: "End date is before the start date", fieldErrors: { endDate: "End is before start" } };
    if (last && start <= plainOf(last.endDate)!) return { ok: false as const, error: "Periods can't overlap", fieldErrors: { startDate: `Start after ${plainOf(last.endDate)}` } };
    let rolledOverIn = d.rolledOverIn ?? 0;
    if (d.rolledOverIn === null && last) {
      // Default rollover from the previous period
      const { periodProgress } = await import("./periods");
      const { computeRollover } = await import("@/lib/domain/packages");
      rolledOverIn = computeRollover(pkg.rolloverPolicy, pkg.rolloverCap, await periodProgress(last.id));
    }
    await db.$transaction(async (tx) => {
      if (last && last.status === "OPEN" && plainOf(last.endDate)! < todayMalta()) await tx.packagePeriod.update({ where: { id: last.id }, data: { status: "CLOSED", closedAt: new Date() } });
      await tx.packagePeriod.create({ data: { packageId, startDate: dbDate(start), endDate: dbDate(end), videosIncluded: d.videosIncluded ?? pkg.videosIncluded ?? 0, rolledOverIn } });
    });
    await logActivity({ actor: user, action: "period.create", entityType: "packagePeriod", clientId: pkg.clientId, summary: `Started a new ${pkg.name} period (${start} → ${end})` });
    revalidatePath(`/packages/${packageId}`);
    revalidatePath("/packages");
    return { ok: true as const, message: "Period created" };
  });
}

export async function updatePeriod(periodId: string, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await assertUser("clients:edit");
    const d = z.object({ videosIncluded: zInt(0, 1000), rolledOverIn: zInt(0, 1000), notes: zOpt(2000) }).parse(formToObject(fd));
    const p = await db.packagePeriod.update({ where: { id: periodId }, data: { videosIncluded: d.videosIncluded ?? 0, rolledOverIn: d.rolledOverIn ?? 0, notes: d.notes } });
    revalidatePath(`/packages/${p.packageId}`);
    return { ok: true as const, message: "Period updated" };
  });
}

export async function syncPackagePeriods(packageId: string): Promise<ActionResult> {
  return runAction(async () => {
    await assertUser("clients:edit");
    const r = await ensurePeriodsForPackage(packageId);
    revalidatePath(`/packages/${packageId}`);
    return { ok: true as const, message: r.created ? `Created ${r.created} period(s)` : "Periods are up to date" };
  });
}

