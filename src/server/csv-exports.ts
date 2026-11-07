import "server-only";
import { db } from "@/lib/db";
import { plainOf, todayMalta } from "@/lib/dates";
import { paymentState } from "@/lib/domain/invoices";

const eur = (c: number | null | undefined) => (c === null || c === undefined ? "" : (c / 100).toFixed(2));
const pct = (bp: number | null | undefined) => (bp === null || bp === undefined ? "" : (bp / 100).toString());

// CSV exports per entity, with human-friendly columns (amounts in EUR, dates YYYY-MM-DD).
export const CSV_EXPORTS: Record<string, { label: string; finance?: boolean; build: () => Promise<Record<string, unknown>[]> }> = {
  clients: {
    label: "Clients",
    build: async () =>
      (await db.client.findMany({ orderBy: { name: "asc" } })).map((c) => ({
        name: c.name, company: c.companyName, contact_person: c.contactPerson, email: c.email, phone: c.phone, whatsapp: c.whatsapp,
        website: c.website, instagram: c.instagram, facebook: c.facebook, tiktok: c.tiktok, industry: c.industry, status: c.status,
        package: c.packageLabel, started: plainOf(c.startedAt), payment_terms_days: c.paymentTermsDays, vat_number: c.vatNumber,
        drive: c.driveUrl, archived: c.archivedAt ? "yes" : "", demo: c.isDemo ? "yes" : "",
      })),
  },
  packages: {
    label: "Video packages",
    build: async () =>
      (await db.servicePackage.findMany({ include: { client: true }, orderBy: { startDate: "asc" } })).map((p) => ({
        client: p.client.name, name: p.name, type: p.type, videos_included: p.videosIncluded, price_eur: eur(p.priceCents), start: plainOf(p.startDate),
        end: plainOf(p.endDate), active: p.active ? "yes" : "no", rollover: p.rolloverPolicy, rollover_cap: p.rolloverCap,
      })),
  },
  videos: {
    label: "Videos",
    build: async () =>
      (await db.video.findMany({ include: { client: true, stage: true, assignee: true }, orderBy: { createdAt: "asc" } })).map((v) => ({
        title: v.title, client: v.client.name, stage: v.stage.name, stage_category: v.stage.category, priority: v.priority, extra: v.isExtra ? "yes" : "",
        filmed_on: plainOf(v.filmedOn), deadline: plainOf(v.deadline), deadline_overridden: v.deadlineOverridden ? "yes" : "", assignee: v.assignee?.name,
        approved_at: v.approvedAt, delivered_at: v.deliveredAt, review_url: v.reviewUrl, delivery_url: v.deliveryUrl,
      })),
  },
  tasks: {
    label: "Tasks",
    build: async () =>
      (await db.task.findMany({ include: { client: true, assignee: true }, orderBy: { createdAt: "asc" } })).map((t) => ({
        title: t.title, description: t.description, client: t.client?.name, assignee: t.assignee?.name, priority: t.priority, status: t.status,
        due: plainOf(t.dueDate), completed_at: t.completedAt, recurrence: t.recurrence,
      })),
  },
  invoices: {
    label: "Invoices",
    finance: true,
    build: async () => {
      const today = todayMalta();
      return (await db.invoice.findMany({ include: { client: true, payments: true }, orderBy: { issueDate: "asc" } })).map((i) => {
        const st = paymentState({ status: i.status, totalCents: i.totalCents, dueDate: plainOf(i.dueDate)! }, i.payments, today);
        return {
          number: i.number, client: i.client.name, description: i.description, issue_date: plainOf(i.issueDate), due_date: plainOf(i.dueDate),
          subtotal_eur: eur(i.subtotalCents), vat_eur: eur(i.vatCents), total_eur: eur(i.totalCents), paid_eur: eur(st.paidCents),
          balance_eur: eur(st.balanceCents), status: st.status, days_overdue: st.daysOverdue || "", vat_note: i.vatNote,
        };
      });
    },
  },
  payments: {
    label: "Payments",
    finance: true,
    build: async () =>
      (await db.payment.findMany({ include: { invoice: { include: { client: true } } }, orderBy: { paidOn: "asc" } })).map((p) => ({
        invoice: p.invoice.number, client: p.invoice.client.name, paid_on: plainOf(p.paidOn), amount_eur: eur(p.amountCents), method: p.method, reference: p.reference,
      })),
  },
  expenses: {
    label: "Expenses",
    finance: true,
    build: async () =>
      (await db.expense.findMany({ include: { client: true }, orderBy: { date: "asc" } })).map((e) => ({
        date: plainOf(e.date), description: e.description, vendor: e.vendor, category: e.category, amount_gross_eur: eur(e.amountCents), vat_eur: eur(e.vatCents),
        vat_rate_pct: pct(e.vatRateBp), vat_reclaimable: e.vatReclaimable ? "yes" : "no", business_use_pct: e.businessUsePct, client: e.client?.name,
        payment_method: e.paymentMethod, recurring: e.recurringId ? "yes" : "",
      })),
  },
  "time-entries": {
    label: "Time entries",
    finance: true,
    build: async () =>
      (await db.timeEntry.findMany({ include: { client: true, user: true, video: true }, orderBy: { date: "asc" } })).map((t) => ({
        date: plainOf(t.date), client: t.client.name, video: t.video?.title, person: t.user?.name, minutes: t.minutes, hours: (t.minutes / 60).toFixed(2), note: t.note,
      })),
  },
};
