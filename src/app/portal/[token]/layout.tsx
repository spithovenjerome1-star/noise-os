import type { Metadata } from "next";
import { getSettings } from "@/server/settings";
import { resolvePortal } from "./_components/resolve";
import { InactiveLink } from "./_components/inactive";
import { ThemeToggle } from "@/components/shell/theme-toggle";

export const metadata: Metadata = { title: "Client portal", robots: { index: false, follow: false } };

export default async function PortalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [link, settings] = await Promise.all([resolvePortal(token), getSettings()]);
  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-fg text-[11px] font-black tracking-tighter text-bg">{settings.businessName.slice(0, 1).toUpperCase()}</span>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[13px] font-semibold tracking-tight">{settings.businessName}</div>
              {link && <div className="truncate text-xs text-muted">{link.client.name}</div>}
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">{link ? children : <InactiveLink businessName={settings.businessName} email={settings.email} />}</main>
      <footer className="mx-auto max-w-3xl px-4 pb-10 pt-4 text-center text-xs text-subtle">
        Private page for {link?.client.name ?? "our clients"} · {settings.businessName}
        {settings.email && <> · <a className="hover:text-fg" href={`mailto:${settings.email}`}>{settings.email}</a></>}
      </footer>
    </div>
  );
}
