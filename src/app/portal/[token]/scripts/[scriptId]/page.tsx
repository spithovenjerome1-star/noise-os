import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { resolvePortal } from "../../_components/resolve";
import { InactiveLink } from "../../_components/inactive";
import { loadPortalScript } from "@/server/portal/data";
import { getPortalName } from "@/server/portal/context";
import { getSettings } from "@/server/settings";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SCRIPT_SECTIONS, CLIENT_SECTIONS } from "@/lib/domain/scripts";
import { fmtMoment } from "@/lib/dates";
import { ScriptDecision } from "../../_components/script-decision";
import { PortalComments } from "../../_components/portal-comments";

export const dynamic = "force-dynamic";

export default async function PortalScriptPage({ params }: { params: Promise<{ token: string; scriptId: string }> }) {
  const { token, scriptId } = await params;
  const link = await resolvePortal(token);
  if (!link) return null;
  const script = await loadPortalScript(link, scriptId);
  if (!script) {
    const s = await getSettings();
    return <InactiveLink businessName={s.businessName} email={s.email} />;
  }
  const name = await getPortalName();
  const sections = SCRIPT_SECTIONS.filter((s) => CLIENT_SECTIONS.includes(s.key) && script.version.content[s.key].trim());
  const lastDecision = script.version.approvals[0];

  return (
    <div className="flex flex-col gap-6 animate-in">
      {link.scope === "CLIENT_PORTAL" && (
        <Link href={`/portal/${token}`} className="inline-flex w-fit items-center gap-1 text-[13px] text-muted hover:text-fg">
          <ArrowLeft className="size-4" /> Back to overview
        </Link>
      )}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{script.title}</h1>
          {script.isApproved && <Badge tone="success"><CheckCircle2 className="size-3" /> Approved</Badge>}
          {script.status === "CHANGES_REQUESTED" && <Badge tone="warning" dot>Changes requested</Badge>}
          {script.awaitingDecision && <Badge tone="violet" dot>Waiting for your review</Badge>}
        </div>
        <p className="mt-1 text-[13px] text-muted">Version {script.version.version} · sent {fmtMoment(script.version.createdAt, "d MMM yyyy")}</p>
      </div>

      <Card className="divide-y divide-border">
        {sections.length === 0 && <p className="p-5 text-[14px] text-muted">This script is empty.</p>}
        {sections.map((s) => (
          <section key={s.key} className="px-5 py-4">
            <h2 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-subtle">{s.label}</h2>
            <p className={s.key === "hook" ? "whitespace-pre-wrap text-[17px] font-medium leading-relaxed" : "whitespace-pre-wrap text-[15px] leading-relaxed"}>{script.version.content[s.key]}</p>
          </section>
        ))}
      </Card>

      {script.awaitingDecision ? (
        <ScriptDecision token={token} scriptId={script.id} hasName={Boolean(name)} />
      ) : lastDecision ? (
        <div className="rounded-lg bg-surface-2 px-4 py-3 text-[13px] text-muted">
          {lastDecision.decision === "APPROVED" ? "Approved" : "Changes requested"} by {lastDecision.byName} on {fmtMoment(lastDecision.createdAt, "d MMM yyyy, HH:mm")}.
          {lastDecision.decision === "CHANGES_REQUESTED" && " We’ll send you an updated version."}
        </div>
      ) : null}

      <PortalComments token={token} scriptId={script.id} comments={script.comments.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }))} hasName={Boolean(name)} />
    </div>
  );
}
