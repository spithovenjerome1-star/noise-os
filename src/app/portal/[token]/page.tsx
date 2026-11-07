import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, ChevronRight, Download, FileText, PlayCircle, Receipt, Clapperboard, Paperclip } from "lucide-react";
import { resolvePortal } from "./_components/resolve";
import { loadPortal } from "@/server/portal/data";
import { getPortalName } from "@/server/portal/context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/misc";
import { CLIENT_VIDEO_STATUS } from "@/lib/domain/portal";
import { INVOICE_STATUS } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { fmtDate, fmtMoment } from "@/lib/dates";
import { VideoReview } from "./_components/video-review";
import { NameGate } from "./_components/name-gate";

export default async function PortalHome({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await resolvePortal(token);
  if (!link) return null; // layout renders the inactive state
  if (link.scope === "SCRIPT" && link.scriptId) redirect(`/portal/${token}/scripts/${link.scriptId}`);
  const data = await loadPortal(link);
  if (!data) return null;
  const name = await getPortalName();
  const reviewCount = data.videos.filter((v) => v.category === "AWAITING_APPROVAL").length + data.scripts.filter((s) => s.status === "SENT").length;
  const openInvoices = data.invoices.filter((i) => i.balanceCents > 0);
  const firstName = name?.split(" ")[0];

  return (
    <div className="flex flex-col gap-8 animate-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{firstName ? `Hi ${firstName}` : `Welcome, ${link.client.name}`}</h1>
        <p className="mt-1 text-[14px] text-muted">
          {reviewCount > 0 ? `${reviewCount} item${reviewCount > 1 ? "s are" : " is"} waiting for your review.` : "Here’s where everything stands."}
        </p>
      </div>

      {!name && (reviewCount > 0 || data.scripts.length > 0) && <NameGate token={token} />}

      {/* Package progress */}
      {data.progress.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle>Your package</SectionTitle>
          {data.progress.map((p) => {
            const pr = p.progress;
            return (
              <Card key={p.packageId} className="p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-[15px] font-semibold tracking-tight">{p.name}</h2>
                  <span className="text-xs text-muted">{fmtDate(p.start, "d MMM")} – {fmtDate(p.end, "d MMM yyyy")}</span>
                </div>
                <div className="mt-4 flex items-end gap-2">
                  <span className="tabular text-4xl font-semibold tracking-tight">{pr.delivered}</span>
                  <span className="pb-1 text-[14px] text-muted">of {pr.included} videos delivered</span>
                </div>
                <Progress
                  className="mt-3 h-2"
                  value={pr.pctDelivered}
                  segments={[
                    { value: pr.pctDelivered, className: "bg-success" },
                    { value: pr.included ? Math.min(100 - pr.pctDelivered, Math.round((pr.approvedNotDelivered / pr.included) * 100)) : 0, className: "bg-success/40" },
                  ]}
                />
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
                  <span><strong className="font-medium text-fg">{pr.remaining}</strong> remaining</span>
                  {pr.counts.AWAITING_APPROVAL > 0 && <span><strong className="font-medium text-fg">{pr.counts.AWAITING_APPROVAL}</strong> ready for review</span>}
                  {pr.counts.EDITING + pr.counts.FILMED > 0 && <span><strong className="font-medium text-fg">{pr.counts.EDITING + pr.counts.FILMED}</strong> in production</span>}
                  {pr.extras > 0 && <span>+{pr.extras} extra video{pr.extras > 1 ? "s" : ""}</span>}
                </div>
              </Card>
            );
          })}
        </section>
      )}

      {/* Videos */}
      <section className="flex flex-col gap-3">
        <SectionTitle>Videos</SectionTitle>
        {data.videos.length === 0 ? (
          <Empty icon={Clapperboard} text="No videos in progress right now." />
        ) : (
          <Card className="divide-y divide-border overflow-hidden">
            {data.videos.map((v) => {
              const st = CLIENT_VIDEO_STATUS[v.category];
              return (
                <div key={v.id} className="flex flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium leading-snug">{v.title}</div>
                      <div className="mt-0.5 text-xs text-muted">
                        {v.filmingOn && v.category === "PLANNED" ? `Filming ${fmtMoment(v.filmingOn, "EEE d MMM, HH:mm")}` : v.isExtra ? "Extra video" : !v.inPackage ? "Project video" : ""}
                        {v.lastDecision && (
                          <span>
                            {v.lastDecision.decision === "APPROVED" ? `Approved by ${v.lastDecision.byName}` : `Revision requested by ${v.lastDecision.byName}`} · {fmtMoment(v.lastDecision.createdAt, "d MMM")}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge tone={st.tone} dot>{st.label}</Badge>
                  </div>
                  {(v.reviewUrl || v.deliveryUrl) && (
                    <div className="flex flex-wrap gap-2">
                      {v.reviewUrl && v.category !== "DELIVERED" && (
                        <a href={v.reviewUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-[13px] font-medium shadow-card hover:bg-surface-2">
                          <PlayCircle className="size-4" /> Watch preview
                        </a>
                      )}
                      {v.deliveryUrl && (
                        <a href={v.deliveryUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-[13px] font-medium shadow-card hover:bg-surface-2">
                          <Download className="size-4" /> Final video
                        </a>
                      )}
                    </div>
                  )}
                  {v.category === "AWAITING_APPROVAL" && <VideoReview token={token} videoId={v.id} title={v.title} hasName={Boolean(name)} />}
                </div>
              );
            })}
          </Card>
        )}
      </section>

      {/* Scripts */}
      {data.scripts.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle>Scripts</SectionTitle>
          <Card className="divide-y divide-border overflow-hidden">
            {data.scripts.map((s) => (
              <Link key={s.id} href={`/portal/${token}/scripts/${s.id}`} className="flex items-center gap-3 p-4 transition-colors hover:bg-surface-2">
                <FileText className="size-4 shrink-0 text-subtle" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{s.title}</div>
                  <div className="text-xs text-muted">Version {s.sentVersion?.version}</div>
                </div>
                {s.status === "SENT" && <Badge tone="violet" dot>Needs your review</Badge>}
                {s.status === "CHANGES_REQUESTED" && <Badge tone="warning" dot>Changes requested</Badge>}
                {s.status === "APPROVED" && <Badge tone="success"><CheckCircle2 className="size-3" /> Approved</Badge>}
                <ChevronRight className="size-4 text-subtle" />
              </Link>
            ))}
          </Card>
        </section>
      )}

      {/* Deliverables */}
      {data.files.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle>Files</SectionTitle>
          <Card className="divide-y divide-border overflow-hidden">
            {data.files.map((f) => (
              <a key={f.id} href={`/api/portal/${token}/files/${f.id}`} className="flex items-center gap-3 p-4 text-[14px] hover:bg-surface-2">
                <Paperclip className="size-4 text-subtle" />
                <span className="min-w-0 flex-1 truncate">{f.fileName}</span>
                <span className="text-xs text-subtle">{fmtDate(f.createdAt, "d MMM")}</span>
                <Download className="size-4 text-subtle" />
              </a>
            ))}
          </Card>
        </section>
      )}

      {/* Invoices */}
      {data.invoices.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle>
            Invoices
            {openInvoices.length > 0 && <span className="ml-2 font-normal normal-case tracking-normal text-muted">· {formatMoney(openInvoices.reduce((s, i) => s + i.balanceCents, 0))} outstanding</span>}
          </SectionTitle>
          <Card className="divide-y divide-border overflow-hidden">
            {data.invoices.map((i) => {
              const st = INVOICE_STATUS[i.status];
              return (
                <div key={i.id} className="flex items-center gap-3 p-4">
                  <Receipt className="hidden size-4 shrink-0 text-subtle sm:block" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium tabular">{i.number}</span>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted">
                      Issued {fmtDate(i.issueDate, "d MMM yyyy")} · {i.status === "PAID" ? "Paid in full" : i.overdue ? `Was due ${fmtDate(i.dueDate, "d MMM")}` : `Due ${fmtDate(i.dueDate, "d MMM yyyy")}`}
                      {i.description ? ` · ${i.description}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="tabular font-medium">{formatMoney(i.totalCents)}</div>
                    {i.balanceCents > 0 && i.paidCents > 0 && <div className="tabular text-xs text-muted">{formatMoney(i.balanceCents)} left</div>}
                    {i.balanceCents > 0 && i.paidCents === 0 && <div className="text-xs text-muted">Unpaid</div>}
                  </div>
                </div>
              );
            })}
          </Card>
        </section>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-medium uppercase tracking-wide text-subtle">{children}</h2>;
}

function Empty({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-6 text-[14px] text-muted">
      <Icon className="size-4" /> {text}
    </div>
  );
}

export const dynamic = "force-dynamic";
