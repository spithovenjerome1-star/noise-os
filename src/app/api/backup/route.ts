import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/server/auth";
import { can } from "@/lib/permissions";
import { logActivity } from "@/server/activity";
import { todayMalta } from "@/lib/dates";

export const dynamic = "force-dynamic";

// Full JSON export of business data. Excludes sessions, password hashes and share-link token hashes.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user.role, "data:export")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [
    settings, vatRates, users, clients, contacts, clientNotes, packages, periods, projects, stages, videos, videoComments,
    scripts, scriptVersions, scriptComments, approvals, shareLinks, tasks, events, invoices, invoiceLines, payments, expenses,
    recurringExpenses, attachments, activity, notifications, automationRules, monthlySummaries, timeEntries, library, equipment,
    eventEquipment, importLogs, importRecords, services, bookings,
  ] = await Promise.all([
    db.settings.findMany(), db.vatRate.findMany(),
    db.user.findMany({ select: { id: true, email: true, name: true, role: true, active: true, canLogin: true, createdAt: true, updatedAt: true } }),
    db.client.findMany(), db.contact.findMany(), db.clientNote.findMany(), db.servicePackage.findMany(), db.packagePeriod.findMany(),
    db.project.findMany(), db.stage.findMany(), db.video.findMany(), db.videoComment.findMany(), db.script.findMany(), db.scriptVersion.findMany(),
    db.scriptComment.findMany(), db.approval.findMany(),
    db.shareLink.findMany({ select: { id: true, scope: true, clientId: true, scriptId: true, label: true, expiresAt: true, revokedAt: true, lastUsedAt: true, useCount: true, createdById: true, createdAt: true } }),
    db.task.findMany(), db.calendarEvent.findMany(), db.invoice.findMany(), db.invoiceLine.findMany(), db.payment.findMany(), db.expense.findMany(),
    db.recurringExpense.findMany(), db.attachment.findMany(), db.activityLog.findMany(), db.notification.findMany(), db.automationRule.findMany(),
    db.monthlySummary.findMany(), db.timeEntry.findMany(), db.libraryItem.findMany(), db.equipment.findMany(), db.eventEquipment.findMany(),
    db.importLog.findMany(), db.importRecord.findMany(), db.service.findMany(), db.bookingRequest.findMany(),
  ]);

  const data = {
    format: "noise-os-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    note: "Money values are integer cents (EUR). Rates are basis points (1800 = 18%). Uploaded files are not included — back up STORAGE_DIR separately.",
    tables: {
      settings, vatRates, users, clients, contacts, clientNotes, packages, periods, projects, stages, videos, videoComments, scripts,
      scriptVersions, scriptComments, approvals, shareLinks, tasks, events, invoices, invoiceLines, payments, expenses, recurringExpenses,
      attachments, activity, notifications, automationRules, monthlySummaries, timeEntries, library, equipment, eventEquipment, importLogs,
      importRecords, services, bookings,
    },
  };
  await logActivity({ actor: user, action: "data.backup", entityType: "system", summary: "Downloaded a full JSON backup" });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="noise-os-backup-${todayMalta()}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
