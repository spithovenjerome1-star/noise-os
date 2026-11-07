import type { Metadata } from "next";
import { Clock } from "lucide-react";
import { db } from "@/lib/db";
import { getSettings } from "@/server/settings";
import { formatMoney } from "@/lib/money";
import { formatDuration } from "@/lib/domain/bookings";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { BookingForm } from "./booking-form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return {
    title: { absolute: `${s.businessName} — Video production & social content, Malta` },
    description: s.publicTagline ?? "Video production and social media content in Malta. Book a shoot.",
  };
}

export default async function BookPage({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  const sp = await searchParams;
  const settings = await getSettings();
  const services = await db.service.findMany({ where: { published: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  const bookable = services.filter((s) => s.bookable);
  const preselect = bookable.find((s) => s.slug === sp.service)?.id;

  return (
    <div className="min-h-dvh bg-bg">
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
        <span className="text-[15px] font-black tracking-tight">{settings.businessName}</span>
        <div className="flex items-center gap-3">
          {settings.instagramUrl && (
            <a href={settings.instagramUrl} target="_blank" rel="noreferrer" className="text-muted hover:text-fg" aria-label="Instagram">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4" aria-hidden><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" /></svg>
            </a>
          )}
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-20">
        <section className="py-12 sm:py-20">
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            {settings.publicTagline || "Video that makes people stop scrolling."}
          </h1>
          {settings.publicAbout && <p className="mt-6 max-w-2xl whitespace-pre-wrap text-[16px] leading-relaxed text-muted">{settings.publicAbout}</p>}
          {settings.publicSiteEnabled && bookable.length > 0 && (
            <a href="#book" className="mt-8 inline-flex h-11 items-center rounded-lg bg-fg px-5 text-sm font-medium text-bg transition-opacity hover:opacity-90">Book a shoot</a>
          )}
        </section>

        {services.length > 0 && (
          <section className="py-6" aria-labelledby="services">
            <h2 id="services" className="mb-5 text-xs font-medium uppercase tracking-wide text-subtle">Services</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((s) => (
                <article key={s.id} className="flex flex-col rounded-xl border border-border bg-surface p-5 shadow-card">
                  <h3 className="text-[15px] font-semibold tracking-tight">{s.name}</h3>
                  {s.summary && <p className="mt-1.5 text-[14px] text-muted">{s.summary}</p>}
                  {s.description && <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-muted">{s.description}</p>}
                  <div className="mt-auto flex items-end justify-between gap-3 pt-5">
                    <div>
                      {s.fromCents !== null && <div className="text-[15px] font-semibold tabular">From {formatMoney(s.fromCents)}</div>}
                      {s.priceNote && <div className="text-xs text-subtle">{s.priceNote}</div>}
                      {s.durationMin ? <div className="mt-1 flex items-center gap-1 text-xs text-subtle"><Clock className="size-3" /> {formatDuration(s.durationMin)}</div> : null}
                    </div>
                    {settings.publicSiteEnabled && s.bookable && (
                      <a href={`?service=${s.slug}#book`} className="text-[13px] font-medium underline-offset-4 hover:underline">Book →</a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section id="book" className="scroll-mt-6 py-12">
          <div className="mx-auto max-w-xl">
            <h2 className="text-2xl font-semibold tracking-tight">Book a shoot</h2>
            {settings.publicSiteEnabled ? (
              <>
                <p className="mt-1.5 text-[14px] text-muted">Tell us what you have in mind. We’ll confirm availability personally — nothing is booked until we get back to you.</p>
                <div className="mt-6 rounded-xl border border-border bg-surface p-5 shadow-card sm:p-6">
                  <BookingForm services={bookable.map((s) => ({ value: s.id, label: s.name }))} defaultServiceId={preselect} />
                </div>
              </>
            ) : (
              <p className="mt-3 rounded-lg bg-surface-2 px-4 py-3 text-[14px] text-muted">
                Bookings are closed right now.{settings.email ? <> Reach us at <a className="underline" href={`mailto:${settings.email}`}>{settings.email}</a>.</> : null}
              </p>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-xs text-subtle">
        {settings.businessName} · Malta{settings.email ? <> · <a href={`mailto:${settings.email}`} className="hover:text-fg">{settings.email}</a></> : null}
        {settings.phone ? <> · {settings.phone}</> : null}
      </footer>
    </div>
  );
}
