import Link from "next/link";
import { CalendarCheck, ExternalLink } from "lucide-react";
import type { BookingStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/tabs";
import { BOOKING_STATUS } from "@/lib/labels";
import { fmtDate, plainOf, timeAgo } from "@/lib/dates";
import { BookingDetail } from "./booking-detail";

export const metadata = { title: "Bookings" };

const FILTERS: { key: string; label: string; where: Prisma.BookingRequestWhereInput }[] = [
  { key: "new", label: "New", where: { status: "NEW" } },
  { key: "confirmed", label: "Confirmed", where: { status: "CONFIRMED" } },
  { key: "closed", label: "Declined & cancelled", where: { status: { in: ["DECLINED", "CANCELLED"] } } },
  { key: "all", label: "All", where: {} },
];

const TIME_LABEL: Record<string, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", flexible: "Flexible" };

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ status?: string; booking?: string; new?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const counts = await db.bookingRequest.groupBy({ by: ["status"], _count: true });
  const count = (s: BookingStatus[]) => counts.filter((c) => s.includes(c.status)).reduce((n, c) => n + c._count, 0);
  const newCount = count(["NEW"]);
  const filter = FILTERS.find((f) => f.key === sp.status) ?? (newCount > 0 || !counts.length ? FILTERS[0]! : FILTERS[3]!);
  const [bookings, selected] = await Promise.all([
    db.bookingRequest.findMany({ where: filter.where, orderBy: { createdAt: "desc" }, take: 200, include: { service: { select: { name: true } } } }),
    sp.booking
      ? db.bookingRequest.findUnique({ where: { id: sp.booking }, include: { service: { select: { name: true, durationMin: true } } } })
      : null,
  ]);
  const [linkedClient, linkedEvent] = selected
    ? await Promise.all([
        selected.clientId ? db.client.findUnique({ where: { id: selected.clientId }, select: { id: true, name: true } }) : db.client.findFirst({ where: { email: { equals: selected.email, mode: "insensitive" } }, select: { id: true, name: true } }),
        selected.eventId ? db.calendarEvent.findUnique({ where: { id: selected.eventId }, select: { id: true, startsAt: true, title: true } }) : null,
      ])
    : [null, null];
  const total = counts.reduce((n, c) => n + c._count, 0);
  const qs = (k: string) => `/bookings?status=${k}`;

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Requests from your public booking page. Nothing is confirmed until you do it here."
        actions={<Button asChild variant="secondary"><Link href="/book" target="_blank"><ExternalLink /> Booking page</Link></Button>}
      >
        {total > 0 && <Segmented active={filter.key} items={FILTERS.map((f) => ({ key: f.key, href: qs(f.key), label: <>{f.label}{f.key === "new" && newCount > 0 ? <span className="tabular rounded bg-accent px-1 text-[10px] text-white">{newCount}</span> : null}</> }))} />}
      </PageHeader>

      {total === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No booking requests yet"
          description="Share your booking page (noise.mt/book) on Instagram or WhatsApp. Requests appear here and in your inbox."
          action={<Button asChild variant="primary"><Link href="/services">Set up services</Link></Button>}
        />
      ) : bookings.length === 0 ? (
        <EmptyState icon={CalendarCheck} title={`No ${filter.label.toLowerCase()} requests`} />
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {bookings.map((b) => (
            <Link key={b.id} href={`/bookings?status=${filter.key}&booking=${b.id}`} scroll={false} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{b.name}</span>
                  {b.company && <span className="text-[13px] text-muted">{b.company}</span>}
                </div>
                <div className="truncate text-xs text-muted">
                  {[b.service?.name ?? "No service chosen", b.preferredDate ? `${fmtDate(plainOf(b.preferredDate), "EEE d MMM")}${b.preferredTime ? ` · ${TIME_LABEL[b.preferredTime] ?? b.preferredTime}` : ""}` : null, b.message].filter(Boolean).join(" · ")}
                </div>
              </div>
              <span className="hidden text-xs text-subtle sm:inline">{timeAgo(b.createdAt)}</span>
              <Badge tone={BOOKING_STATUS[b.status].tone} dot>{BOOKING_STATUS[b.status].label}</Badge>
            </Link>
          ))}
        </Card>
      )}

      {selected && (
        <BookingDetail
          closeHref={qs(filter.key)}
          booking={{
            id: selected.id,
            name: selected.name,
            company: selected.company,
            email: selected.email,
            phone: selected.phone,
            preferredDate: plainOf(selected.preferredDate),
            preferredTime: selected.preferredTime ? (TIME_LABEL[selected.preferredTime] ?? selected.preferredTime) : null,
            rawTime: selected.preferredTime,
            message: selected.message,
            status: selected.status,
            serviceName: selected.service?.name ?? null,
            durationMin: selected.service?.durationMin ?? null,
            createdAt: selected.createdAt.toISOString(),
          }}
          linkedClient={linkedClient}
          clientIsLinked={Boolean(selected.clientId)}
          linkedEvent={linkedEvent ? { id: linkedEvent.id, title: linkedEvent.title, startsAt: linkedEvent.startsAt.toISOString() } : null}
        />
      )}
    </>
  );
}
