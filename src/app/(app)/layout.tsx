import { AppShell } from "@/components/shell/app-shell";
import { requireUser } from "@/server/auth";
import { capabilitiesOf } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getSettings } from "@/server/settings";
import { logoutAction } from "@/server/session-actions";
import { maybeRunAutomations } from "@/server/automations/run";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Keep derived alerts fresh without a cron in local use (throttled, never sends anything externally).
  await maybeRunAutomations();
  const [settings, unread, newBookings] = await Promise.all([
    getSettings(),
    db.notification.count({ where: { resolvedAt: null, readAt: null } }),
    db.bookingRequest.count({ where: { status: "NEW" } }),
  ]);
  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role }}
      caps={capabilitiesOf(user.role)}
      badges={{ "/notifications": unread, "/bookings": newBookings }}
      businessName={settings.businessName}
      logoutAction={logoutAction}
    >
      {children}
    </AppShell>
  );
}
