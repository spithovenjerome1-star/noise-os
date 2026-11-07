import type { Recurrence, TaskStatus } from "@prisma/client";
import { addDaysPlain, addIntervalPlain, type PlainDate } from "../dates";

/** Due date of the next occurrence of a recurring task. Null when it doesn't repeat. */
export function nextOccurrenceDue(recurrence: Recurrence, dueDate: PlainDate | null, completedOn: PlainDate): PlainDate | null {
  if (recurrence === "NONE") return null;
  // Anchor on the original due date so a late completion doesn't drift the schedule,
  // but never create the next occurrence in the past.
  let next = addIntervalPlain(dueDate ?? completedOn, recurrence, 1);
  let guard = 0;
  while (next < completedOn && guard++ < 1000) next = addIntervalPlain(next, recurrence, 1);
  return next;
}

export type TaskView = "today" | "week" | "overdue" | "waiting" | "editing" | "all";

export const TASK_VIEWS: { key: TaskView; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "overdue", label: "Overdue" },
  { key: "waiting", label: "Waiting for client" },
  { key: "editing", label: "Editing queue" },
  { key: "all", label: "All tasks" },
];

export type ViewTask = {
  status: TaskStatus;
  dueDate: PlainDate | null;
  videoCategory?: string | null;
  hasVideo?: boolean;
};

/** Whether a task belongs to a smart view. Done tasks only show in "all". */
export function taskInView(t: ViewTask, view: TaskView, today: PlainDate) {
  const open = t.status !== "DONE";
  switch (view) {
    case "today":
      return open && t.dueDate !== null && t.dueDate <= today;
    case "week":
      return open && t.dueDate !== null && t.dueDate <= addDaysPlain(today, 6);
    case "overdue":
      return open && t.dueDate !== null && t.dueDate < today;
    case "waiting":
      return open && t.status === "WAITING_CLIENT";
    case "editing":
      return open && (t.videoCategory === "EDITING" || (t.status === "IN_PROGRESS" && Boolean(t.hasVideo)));
    case "all":
      return true;
  }
}

/** Grouping bucket for the task list. */
export function dueBucket(dueDate: PlainDate | null, status: TaskStatus, today: PlainDate) {
  if (status === "DONE") return "Done";
  if (!dueDate) return "No due date";
  if (dueDate < today) return "Overdue";
  if (dueDate === today) return "Today";
  if (dueDate <= addDaysPlain(today, 6)) return "This week";
  return "Later";
}

export const BUCKET_ORDER = ["Overdue", "Today", "This week", "Later", "No due date", "Done"];

/** Position value between two neighbours for drag-and-drop ordering. */
export function positionBetween(before: number | null, after: number | null) {
  if (before === null && after === null) return 1000;
  if (before === null) return (after as number) - 1000;
  if (after === null) return before + 1000;
  return (before + after) / 2;
}
