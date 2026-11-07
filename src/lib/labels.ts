import type {
  ClientStatus, Priority, TaskStatus, ExpenseCategory, PaymentMethod, EventType, ScriptStatus, ProjectStatus, BookingStatus, LibraryType, EquipmentStatus, Recurrence, Interval, AttachmentKind, Role,
} from "@prisma/client";
import type { Tone } from "@/components/ui/badge";
import type { DisplayStatus } from "./domain/invoices";
import type { DeadlineState } from "./domain/deadlines";

export const CLIENT_STATUS: Record<ClientStatus, { label: string; tone: Tone }> = {
  LEAD: { label: "Lead", tone: "info" },
  ACTIVE: { label: "Active", tone: "success" },
  PAUSED: { label: "Paused", tone: "warning" },
  FORMER: { label: "Former", tone: "neutral" },
};

export const PRIORITY: Record<Priority, { label: string; tone: Tone; rank: number }> = {
  URGENT: { label: "Urgent", tone: "danger", rank: 0 },
  HIGH: { label: "High", tone: "warning", rank: 1 },
  NORMAL: { label: "Normal", tone: "neutral", rank: 2 },
  LOW: { label: "Low", tone: "neutral", rank: 3 },
};

export const TASK_STATUS: Record<TaskStatus, { label: string; tone: Tone }> = {
  TODO: { label: "To do", tone: "neutral" },
  IN_PROGRESS: { label: "In progress", tone: "info" },
  WAITING_CLIENT: { label: "Waiting for client", tone: "violet" },
  DONE: { label: "Done", tone: "success" },
};

export const EXPENSE_CATEGORY: Record<ExpenseCategory, string> = {
  CAMERA_EQUIPMENT: "Camera equipment",
  LENSES_ACCESSORIES: "Lenses & accessories",
  SOFTWARE: "Software subscriptions",
  FREELANCE_EDITORS: "Freelance editors",
  TRANSPORT: "Transport",
  VEHICLE: "Vehicle",
  MARKETING: "Marketing & advertising",
  OFFICE: "Office",
  TRAVEL: "Travel",
  OTHER: "Other",
};

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
  BANK_TRANSFER: "Bank transfer",
  CASH: "Cash",
  CARD: "Card",
  REVOLUT: "Revolut",
  PAYPAL: "PayPal",
  CHEQUE: "Cheque",
  BARTER: "Barter",
  OTHER: "Other",
};

export const EVENT_TYPE: Record<EventType | "EDIT_DEADLINE" | "INVOICE_DUE", { label: string; dot: string; chip: string }> = {
  SHOOT: { label: "Shoot", dot: "bg-accent", chip: "bg-accent/10 text-accent" },
  MEETING: { label: "Meeting", dot: "bg-info", chip: "bg-info-bg text-info" },
  MILESTONE: { label: "Milestone", dot: "bg-violet", chip: "bg-violet-bg text-violet" },
  DELIVERY: { label: "Delivery", dot: "bg-success", chip: "bg-success-bg text-success" },
  OTHER: { label: "Other", dot: "bg-subtle", chip: "bg-surface-2 text-muted" },
  EDIT_DEADLINE: { label: "Editing deadline", dot: "bg-warning", chip: "bg-warning-bg text-warning" },
  INVOICE_DUE: { label: "Invoice due", dot: "bg-danger", chip: "bg-danger-bg text-danger" },
};

export const SCRIPT_STATUS: Record<ScriptStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  INTERNAL_REVIEW: { label: "Internal review", tone: "info" },
  SENT: { label: "Sent to client", tone: "violet" },
  CHANGES_REQUESTED: { label: "Changes requested", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
};

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Active", tone: "success" },
  ON_HOLD: { label: "On hold", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const INVOICE_STATUS: Record<DisplayStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SENT: { label: "Sent", tone: "info" },
  PARTIALLY_PAID: { label: "Partially paid", tone: "violet" },
  PAID: { label: "Paid", tone: "success" },
  OVERDUE: { label: "Overdue", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const DEADLINE_STATE: Record<DeadlineState, { label: string; tone: Tone }> = {
  none: { label: "No deadline", tone: "neutral" },
  done: { label: "Delivered", tone: "success" },
  ok: { label: "On track", tone: "neutral" },
  soon: { label: "Due soon", tone: "warning" },
  today: { label: "Due today", tone: "warning" },
  overdue: { label: "Overdue", tone: "danger" },
};

export const BOOKING_STATUS: Record<BookingStatus, { label: string; tone: Tone }> = {
  NEW: { label: "New", tone: "info" },
  CONFIRMED: { label: "Confirmed", tone: "success" },
  DECLINED: { label: "Declined", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const LIBRARY_TYPE: Record<LibraryType, string> = {
  CONCEPT: "Concept",
  HOOK: "Hook",
  CAPTION: "Caption",
  SHOT_LIST: "Shot list",
  TEMPLATE: "Template",
};

export const EQUIPMENT_STATUS: Record<EquipmentStatus, { label: string; tone: Tone }> = {
  AVAILABLE: { label: "Available", tone: "success" },
  IN_REPAIR: { label: "In repair", tone: "warning" },
  RETIRED: { label: "Retired", tone: "neutral" },
};

export const RECURRENCE: Record<Recurrence, string> = { NONE: "Does not repeat", DAILY: "Daily", WEEKLY: "Weekly", MONTHLY: "Monthly", YEARLY: "Yearly" };
export const INTERVAL: Record<Interval, string> = { WEEKLY: "Weekly", MONTHLY: "Monthly", YEARLY: "Yearly" };
export const ATTACHMENT_KIND: Record<AttachmentKind, string> = { CONTRACT: "Contract", RECEIPT: "Receipt", INVOICE_PDF: "Invoice PDF", BRAND: "Brand asset", DELIVERABLE: "Deliverable", OTHER: "Other" };
export const ROLE: Record<Role, string> = { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Team member" };

export const STAGE_COLORS: Record<string, string> = {
  zinc: "bg-zinc-400",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  pink: "bg-pink-500",
  teal: "bg-teal-500",
  green: "bg-green-500",
  red: "bg-red-500",
};

export function options<T extends string>(rec: Record<T, string | { label: string }>) {
  return (Object.keys(rec) as T[]).map((k) => ({ value: k, label: typeof rec[k] === "string" ? (rec[k] as string) : (rec[k] as { label: string }).label }));
}
