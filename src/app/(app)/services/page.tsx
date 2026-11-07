import Link from "next/link";
import { ExternalLink, Store } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ServiceDialog, ServiceRow, PublicSiteForm } from "./services-client";

export const metadata = { title: "Services & site" };

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  await requireUser("settings:manage");
  const sp = await searchParams;
  const [services, settings, pending] = await Promise.all([
    db.service.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }], include: { _count: { select: { bookings: true } } } }),
    getSettings(),
    db.bookingRequest.count({ where: { status: "NEW" } }),
  ]);
  const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
  return (
    <>
      <PageHeader
        title="Services & booking page"
        description="What you offer publicly, and the page where new clients request a shoot."
        actions={
          <>
            <Button asChild variant="secondary"><Link href="/book" target="_blank"><ExternalLink /> Preview page</Link></Button>
            <ServiceDialog defaultOpen={sp.new === "1"} />
          </>
        }
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-3">
          {services.length === 0 ? (
            <EmptyState icon={Store} title="No services yet" description="Add the services you offer — reels packages, event coverage, brand films. Publish the ones you want on your booking page." action={<ServiceDialog label="Add your first service" />} />
          ) : (
            <Card className="divide-y divide-border overflow-hidden">
              {services.map((s, i) => (
                <ServiceRow
                  key={s.id}
                  first={i === 0}
                  last={i === services.length - 1}
                  service={{ id: s.id, name: s.name, slug: s.slug, summary: s.summary, description: s.description, fromCents: s.fromCents, priceNote: s.priceNote, durationMin: s.durationMin, bookable: s.bookable, published: s.published, bookings: s._count.bookings }}
                />
              ))}
            </Card>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Booking page" description={`${appUrl}/book`} />
            <CardBody>
              <PublicSiteForm settings={{ publicSiteEnabled: settings.publicSiteEnabled, publicTagline: settings.publicTagline, publicAbout: settings.publicAbout, instagramUrl: settings.instagramUrl }} />
            </CardBody>
          </Card>
          <Card>
            <CardBody className="pt-4 text-[13px] text-muted">
              {pending > 0 ? (
                <>You have <Link href="/bookings" className="font-medium text-fg underline">{pending} new booking request{pending > 1 ? "s" : ""}</Link>.</>
              ) : (
                <>Requests from the booking page land in <Link href="/bookings" className="text-fg underline">Bookings</Link>. Nothing is confirmed or sent automatically.</>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
