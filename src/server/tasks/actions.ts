"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, type TaskStatus, type Priority } from "@prisma/client";
import { db } from "@/lib/db";
import { dbDateOrNull, plainOf, todayMalta } from "@/lib/dates";
import { nextOccurrenceDue } from "@/lib/domain/tasks";
import { assertUser, type CurrentUser } from "../auth";
import { formToObject, runAction, UserError, type ActionResult } from "../action";
import { zDate, zId, zOpt, zReq } from "../zod";
import { logActivity } from "../activity";

const STATUSES = ["TODO", "IN_PROGRESS", "WAITING_CLIENT", "DONE"] as const;
const PRIORITIES = ["URGENT", "HIGH", "NORMAL", "LOW"] as const;
const RECURRENCES = ["NONE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;

const taskSchema = z.object({
  title: zReq("Title", 300),
  description: zOpt(5000),
  clientId: zId,
  projectId: zId,
  videoId: zId,
  assigneeId: zId,
  priority: z.enum(PRIORITIES).default("NORMAL"),
  dueDate: zDate,
  status: z.enum(STATUSES).default("TODO"),
  recurrence: z.enum(RECURRENCES).default("NONE"),
});

function done(clientId?: string | null) {
  revalidatePath("/tasks");
  revalidatePath("/");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

/** Make links consistent: a video or project implies its client. */
async function resolveLinks<T extends { clientId: string | null; projectId: string | null; videoId: string | null }>(d: T): Promise<T> {
  let clientId = d.clientId;
  if (d.videoId) {
    const v = await db.video.findUnique({ where: { id: d.videoId }, select: { clientId: true } });
    if (!v) throw new UserError("That video no longer exists");
    if (clientId && clientId !== v.clientId) throw new UserError("The video belongs to a different client");
    clientId = v.clientId;
  }
  if (d.projectId) {
    const p = await db.project.findUnique({ where: { id: d.projectId }, select: { clientId: true } });
    if (!p) throw new UserError("That project no longer exists");
    if (clientId && clientId !== p.clientId) throw new UserError("The project belongs to a different client");
    clientId = p.clientId;
  }
  return { ...d, clientId };
}

/** Create the next occurrence of a recurring task (at most once per task). */
async function spawnNext(tx: Prisma.TransactionClient, task: { id: string; title: string; description: string | null; clientId: string | null; projectId: string | null; videoId: string | null; assigneeId: string | null; priority: Priority; dueDate: Date | null; recurrence: (typeof RECURRENCES)[number]; isDemo: boolean }) {
  const due = nextOccurrenceDue(task.recurrence, plainOf(task.dueDate), todayMalta());
  if (!due) return null;
  const exists = await tx.task.findUnique({ where: { recurredFromId: task.id }, select: { id: true } });
  if (exists) return null;
  return tx.task.create({
    data: {
      title: task.title,
      description: task.description,
      clientId: task.clientId,
      projectId: task.projectId,
      videoId: task.videoId,
      assigneeId: task.assigneeId,
      priority: task.priority,
      recurrence: task.recurrence,
      dueDate: dbDateOrNull(due),
      recurredFromId: task.id,
      isDemo: task.isDemo,
    },
  });
}

async function applyStatus(user: CurrentUser, id: string, status: TaskStatus) {
  return db.$transaction(async (tx) => {
    const t = await tx.task.findUnique({ where: { id } });
    if (!t) throw new UserError("That task no longer exists");
    const completing = status === "DONE" && t.status !== "DONE";
    await tx.task.update({ where: { id }, data: { status, completedAt: status === "DONE" ? (t.completedAt ?? new Date()) : null } });
    let next = null;
    if (completing) {
      next = await spawnNext(tx, t);
      await logActivity({ actor: user, action: "task.complete", entityType: "task", entityId: id, clientId: t.clientId, summary: `Completed task “${t.title}”` }, tx);
    }
    return { task: t, next };
  });
}

export async function createTask(fd: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const d = await resolveLinks(taskSchema.parse(formToObject(fd)));
    const t = await db.task.create({
      data: { ...d, dueDate: dbDateOrNull(d.dueDate), completedAt: d.status === "DONE" ? new Date() : null },
    });
    await logActivity({ actor: user, action: "task.create", entityType: "task", entityId: t.id, clientId: t.clientId, summary: `Created task “${t.title}”` });
    done(t.clientId);
    return { ok: true as const, data: { id: t.id }, message: "Task created" };
  });
}

export async function updateTask(id: string, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const d = await resolveLinks(taskSchema.parse(formToObject(fd)));
    const { status, ...rest } = d;
    await db.task.update({ where: { id }, data: { ...rest, dueDate: dbDateOrNull(d.dueDate) } });
    const r = await applyStatus(user, id, status);
    done(d.clientId);
    return { ok: true as const, data: { id }, message: r.next ? `Saved · next one due ${plainOf(r.next.dueDate)}` : "Task saved" };
  });
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    z.enum(STATUSES).parse(status);
    const r = await applyStatus(user, id, status);
    done(r.task.clientId);
    return { ok: true as const, message: status === "DONE" ? (r.next ? `Done · next one due ${plainOf(r.next.dueDate)}` : "Task completed") : "Task reopened" };
  });
}

export async function setTaskPriority(id: string, priority: Priority): Promise<ActionResult> {
  return runAction(async () => {
    await assertUser("production:edit");
    z.enum(PRIORITIES).parse(priority);
    const t = await db.task.update({ where: { id }, data: { priority } });
    done(t.clientId);
    return { ok: true as const, message: "Priority updated" };
  });
}

export async function deleteTask(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertUser("production:edit");
    const t = await db.task.delete({ where: { id } });
    await logActivity({ actor: user, action: "task.delete", entityType: "task", entityId: id, clientId: t.clientId, summary: `Deleted task “${t.title}”` });
    done(t.clientId);
    return { ok: true as const, message: "Task deleted" };
  });
}
