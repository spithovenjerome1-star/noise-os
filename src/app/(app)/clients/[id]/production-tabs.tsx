import Link from "next/link";
import { Clapperboard, FileText, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { fmtDate, plainOf, todayMalta } from "@/lib/dates";
import { deadlineState } from "@/lib/domain/deadlines";
import { DEADLINE_STATE, PRIORITY, SCRIPT_STATUS, STAGE_COLORS } from "@/lib/labels";
import { getSettings } from "@/server/settings";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionTitle } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PackageProgressSummary } from "@/components/clients/package-progress";
import { computePeriodProgress } from "@/lib/domain/packages";
import { cn } from "@/lib/utils";

export async function VideosTab({ clientId }: { clientId: string }) {
  const [videos, settings] = await Promise.all([
    db.video.findMany({
      where: { clientId },
      include: {
        stage: true,
        assignee: { select: { name: true } },
        packagePeriod: { include: { package: { select: { id: true, name: true } } } },
      },
      orderBy: [{ deadline: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    }),
    getSettings(),
  ]);
  const today = todayMalta();
  if (!videos.length)
    return (
      <EmptyState
        icon={Clapperboard}
        title="No videos yet"
        description="Videos you create for this client will appear here, grouped by package period."
        action={<Button variant="primary" asChild><Link href={`/videos?new=1&client=${clientId}`}><Plus /> Create video</Link></Button>}
      />
    );

  // Group by period (most recent period first), unassigned last.
  const groups = new Map<string, { key: string; title: string; sub?: string; periodId?: string; included?: number; rolled?: number; packageId?: string; videos: typeof videos }>();
  for (const v of videos) {
    const p = v.packagePeriod;
    const key = p ? p.id : "none";
    if (!groups.has(key))
      groups.set(key, {
        key,
        title: p ? p.package.name : "Not linked to a package",
        sub: p ? `${fmtDate(plainOf(p.startDate), "d MMM")} – ${fmtDate(plainOf(p.endDate), "d MMM yyyy")}${p.status === "CLOSED" ? " · closed" : ""}` : "Extra or standalone videos",
        periodId: p?.id,
        included: p?.videosIncluded,
        rolled: p?.rolledOverIn,
        packageId: p?.package.id,
        videos: [],
      });
    groups.get(key)!.videos.push(v);
  }
  const ordered = [...groups.values()].sort((a, b) => {
    if (a.key === "none") return 1;
    if (b.key === "none") return -1;
    const pa = a.videos[0]!.packagePeriod!.startDate.getTime();
    const pb = b.videos[0]!.packagePeriod!.startDate.getTime();
    return pb - pa;
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button variant="primary" size="sm" asChild><Link href={`/videos?new=1&client=${clientId}`}><Plus /> Create video</Link></Button>
      </div>
      {ordered.map((g) => {
        const progress = g.periodId ? computePeriodProgress({ videosIncluded: g.included ?? 0, rolledOverIn: g.rolled ?? 0 }, g.videos.map((v) => ({ isExtra: v.isExtra, category: v.stage.category }))) : null;
        return (
          <section key={g.key}>
            <SectionTitle action={g.packageId && <Link href={`/packages/${g.packageId}`} className="text-xs text-muted hover:text-fg">Package →</Link>}>
              {g.title} <span className="font-normal normal-case tracking-normal">· {g.sub}</span>
            </SectionTitle>
            {progress && <div className="mb-3 max-w-md"><PackageProgressSummary progress={progress} compact /></div>}
            <Card>
              <Table>
                <THead>
                  <TR>
                    <TH>Video</TH>
                    <TH>Stage</TH>
                    <TH>Deadline</TH>
                    <TH className="hidden md:table-cell">Editor</TH>
                    <TH className="hidden md:table-cell">Priority</TH>
                  </TR>
                </THead>
                <TBody>
                  {g.videos.map((v) => {
                    const ds = deadlineState(plainOf(v.deadline), v.stage.category, today, settings.deadlineWarningDays);
                    return (
                      <TR key={v.id} className="hover:bg-surface-2/60">
                        <TD>
                          <Link href={`/videos/${v.id}`} className="font-medium hover:underline">{v.title}</Link>
                          {v.isExtra && <Badge className="ml-2" tone="accent">Extra</Badge>}
                        </TD>
                        <TD>
                          <span className="inline-flex items-center gap-1.5 text-[13px]">
                            <span className={cn("size-2 rounded-full", STAGE_COLORS[v.stage.color] ?? "bg-zinc-400")} />
                            {v.stage.name}
                          </span>
                        </TD>
                        <TD>
                          {v.deadline ? (
                            <span className="flex items-center gap-2">
                              <span className="tabular text-[13px]">{fmtDate(plainOf(v.deadline), "d MMM")}</span>
                              {(ds === "overdue" || ds === "today" || ds === "soon") && <Badge tone={DEADLINE_STATE[ds].tone}>{DEADLINE_STATE[ds].label}</Badge>}
                            </span>
                          ) : (
                            <span className="text-subtle">—</span>
                          )}
                        </TD>
                        <TD className="hidden text-muted md:table-cell">{v.assignee?.name ?? "—"}</TD>
                        <TD className="hidden md:table-cell">
                          {v.priority !== "NORMAL" ? <Badge tone={PRIORITY[v.priority].tone}>{PRIORITY[v.priority].label}</Badge> : <span className="text-subtle">Normal</span>}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </Card>
          </section>
        );
      })}
    </div>
  );
}

export async function ScriptsTab({ clientId }: { clientId: string }) {
  const scripts = await db.script.findMany({
    where: { clientId },
    include: { video: { select: { id: true, title: true } }, approvedVersion: { select: { version: true } }, _count: { select: { versions: true, comments: true } } },
    orderBy: { updatedAt: "desc" },
  });
  if (!scripts.length)
    return (
      <EmptyState
        icon={FileText}
        title="No scripts yet"
        description="Write scripts and send them to the client for approval."
        action={<Button variant="primary" asChild><Link href={`/scripts?new=1&client=${clientId}`}><Plus /> Write script</Link></Button>}
      />
    );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button variant="primary" size="sm" asChild><Link href={`/scripts?new=1&client=${clientId}`}><Plus /> Write script</Link></Button>
      </div>
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Script</TH>
              <TH>Status</TH>
              <TH className="hidden md:table-cell">Video</TH>
              <TH className="hidden md:table-cell">Updated</TH>
            </TR>
          </THead>
          <TBody>
            {scripts.map((s) => (
              <TR key={s.id} className="hover:bg-surface-2/60">
                <TD>
                  <Link href={`/scripts/${s.id}`} className="font-medium hover:underline">{s.title}</Link>
                  <div className="text-xs text-subtle">
                    {s._count.versions} version{s._count.versions === 1 ? "" : "s"}
                    {s.approvedVersion ? ` · v${s.approvedVersion.version} approved` : ""}
                    {s._count.comments ? ` · ${s._count.comments} comments` : ""}
                  </div>
                </TD>
                <TD><Badge tone={SCRIPT_STATUS[s.status].tone}>{SCRIPT_STATUS[s.status].label}</Badge></TD>
                <TD className="hidden md:table-cell">{s.video ? <Link href={`/videos/${s.video.id}`} className="text-muted hover:text-fg hover:underline">{s.video.title}</Link> : <span className="text-subtle">—</span>}</TD>
                <TD className="hidden text-muted md:table-cell">{fmtDate(s.updatedAt, "d MMM")}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
