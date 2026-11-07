import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, FileText, Film, FolderOpen, Send, CheckCircle2, MessageSquareWarning, Clock } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { can } from "@/lib/permissions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtDate, fmtMoment, plainOf, todayMalta, timeAgo } from "@/lib/dates";
import { SCRIPT_STATUS, TASK_STATUS } from "@/lib/labels";
import { clientOptions, userOptions, stageList } from "@/server/lookups";
import { getSettings } from "@/server/settings";
import { toVideoDTO, videoListInclude } from "@/server/videos/queries";
import { openPeriodOptions } from "@/server/videos/logic";
import { EditVideoForm } from "@/components/videos/video-form";
import { DeadlineChip, PriorityMark, StageDot } from "@/components/videos/video-bits";
import { AttachmentList, UploadButton } from "@/components/attachments";
import { CommentsPanel, TimeLogPanel, ScriptButton, DeleteVideoButton, QuickStage } from "./detail-client";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await db.video.findUnique({ where: { id }, select: { title: true } });
  return { title: v?.title ?? "Video" };
}

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const v = await db.video.findUnique({
    where: { id },
    include: {
      ...videoListInclude,
      script: { select: { id: true, status: true, title: true } },
      comments: { orderBy: { createdAt: "asc" } },
      approvals: { orderBy: { createdAt: "desc" } },
      attachments: { orderBy: { createdAt: "desc" } },
      tasks: { orderBy: [{ status: "asc" }, { dueDate: "asc" }], select: { id: true, title: true, status: true, dueDate: true } },
      timeEntries: { orderBy: { date: "desc" }, include: { user: { select: { name: true } } } },
    },
  });
  if (!v) notFound();
  const editable = can(user.role, "production:edit");
  const [settings, stages, clients, users, periods, projects] = await Promise.all([
    getSettings(),
    stageList(),
    clientOptions(true),
    userOptions(),
    openPeriodOptions(),
    db.project.findMany({ where: { OR: [{ status: { in: ["ACTIVE", "ON_HOLD"] } }, { id: v.projectId ?? "" }] }, orderBy: { name: "asc" }, select: { id: true, name: true, clientId: true } }),
  ]);
  const dto = toVideoDTO(v);
  const today = todayMalta();
  const formData = {
    clients,
    stages: stages.map((s) => ({ id: s.id, name: s.name })),
    users,
    periods,
    projects: projects.map((p) => ({ value: p.id, label: p.name, clientId: p.clientId })),
  };
  const links = [
    { label: "Footage", href: v.footageUrl, icon: FolderOpen },
    { label: "Review", href: v.reviewUrl, icon: Film },
    { label: "Delivery", href: v.deliveryUrl, icon: Send },
  ].filter((l) => l.href);
  const totalMinutes = v.timeEntries.reduce((s, t) => s + t.minutes, 0);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/videos" className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-fg"><ArrowLeft className="size-3.5" /> Production</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">{v.title}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-muted">
              <Link href={`/clients/${v.clientId}`} className="hover:text-fg hover:underline">{v.client.name}</Link>
              <span className="text-subtle">·</span>
              <span className="flex items-center gap-1.5"><StageDot color={v.stage.color} />{v.stage.name}</span>
              <DeadlineChip deadline={dto.deadline} category={dto.category} today={today} warningDays={settings.deadlineWarningDays} />
              {dto.deadline && <span className="text-xs text-subtle">Due {fmtDate(dto.deadline)}{v.deadlineOverridden ? " (manual)" : v.filmedOn ? " (auto)" : ""}</span>}
              <PriorityMark priority={v.priority} />
              {v.isExtra ? <Badge tone="accent">Extra</Badge> : v.packagePeriod ? <Badge>{v.packagePeriod.package.name}</Badge> : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {links.map((l) => (
              <Button key={l.label} size="sm" asChild>
                <a href={l.href!} target="_blank" rel="noreferrer"><l.icon /> {l.label} <ExternalLink className="!size-3 text-subtle" /></a>
              </Button>
            ))}
            {editable && <QuickStage videoId={v.id} stageId={v.stageId} stages={stages.map((s) => ({ id: s.id, name: s.name }))} />}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Details" description="Deadline follows the filming date (turnaround rule) unless overridden." />
            <CardBody>
              {editable ? (
                <EditVideoForm key={v.updatedAt.toISOString()} data={formData} video={dto} />
              ) : (
                <dl className="grid grid-cols-2 gap-3 text-[13px]">
                  <div><dt className="text-xs text-subtle">Shoot</dt><dd>{fmtMoment(v.shootDate)}</dd></div>
                  <div><dt className="text-xs text-subtle">Filmed on</dt><dd>{fmtDate(plainOf(v.filmedOn))}</dd></div>
                  <div className="col-span-2"><dt className="text-xs text-subtle">Description</dt><dd className="whitespace-pre-wrap">{v.description ?? "—"}</dd></div>
                </dl>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Comments" description="Internal comments are never shown to the client. Client feedback from the portal appears here too." />
            <CardBody>
              <CommentsPanel
                videoId={v.id}
                currentUserId={user.id}
                canEdit={editable}
                comments={v.comments.map((c) => ({ id: c.id, authorName: c.authorName, authorId: c.authorId, body: c.body, source: c.source, createdAt: c.createdAt.toISOString(), ago: timeAgo(c.createdAt) }))}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Files" action={editable ? <UploadButton target={{ videoId: v.id }} kind="DELIVERABLE" allowClientVisibility /> : undefined} description="Toggle the eye to make a file available in the client portal." />
            <CardBody>
              <AttachmentList items={v.attachments} canEdit={editable} showVisibility />
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Script" />
            <CardBody>
              {v.script ? (
                <Link href={`/scripts/${v.script.id}`} className="flex items-center gap-2 rounded-lg border border-border p-2.5 text-[13px] hover:bg-surface-2">
                  <FileText className="size-4 text-subtle" />
                  <span className="min-w-0 flex-1 truncate">{v.script.title}</span>
                  <Badge tone={SCRIPT_STATUS[v.script.status].tone}>{SCRIPT_STATUS[v.script.status].label}</Badge>
                </Link>
              ) : editable ? (
                <ScriptButton videoId={v.id} />
              ) : (
                <p className="text-[13px] text-muted">No script yet.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Approvals" />
            <CardBody>
              {v.approvals.length === 0 ? (
                <p className="text-[13px] text-muted">No client decisions recorded yet.</p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {v.approvals.map((a) => (
                    <li key={a.id} className="flex gap-2 text-[13px]">
                      {a.decision === "APPROVED" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : <MessageSquareWarning className="mt-0.5 size-4 shrink-0 text-warning" />}
                      <div className="min-w-0">
                        <p><span className="font-medium">{a.byName}</span> {a.decision === "APPROVED" ? "approved the video" : "requested changes"}</p>
                        {a.note && <p className="mt-0.5 whitespace-pre-wrap text-muted">{a.note}</p>}
                        <p className="mt-0.5 text-xs text-subtle">{fmtMoment(a.createdAt)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Tasks" action={editable ? <Button size="sm" variant="ghost" asChild><Link href={`/tasks?new=1&video=${v.id}&client=${v.clientId}`}>Add</Link></Button> : undefined} />
            <CardBody>
              {v.tasks.length === 0 ? (
                <p className="text-[13px] text-muted">No tasks linked.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {v.tasks.map((t) => (
                    <li key={t.id}>
                      <Link href={`/tasks?view=all&task=${t.id}`} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-[13px] hover:bg-surface-2">
                        <span className={t.status === "DONE" ? "flex-1 truncate text-subtle line-through" : "flex-1 truncate"}>{t.title}</span>
                        {t.dueDate && <span className="text-xs text-subtle">{fmtDate(plainOf(t.dueDate), "d MMM")}</span>}
                        <Badge tone={TASK_STATUS[t.status].tone}>{TASK_STATUS[t.status].label}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Time" description={totalMinutes ? <span className="flex items-center gap-1"><Clock className="size-3" /> {Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m logged</span> : "Optional time tracking"} />
            <CardBody>
              <TimeLogPanel
                videoId={v.id}
                canEdit={editable}
                today={today}
                entries={v.timeEntries.map((t) => ({ id: t.id, date: plainOf(t.date)!, minutes: t.minutes, note: t.note, userName: t.user?.name ?? null }))}
              />
            </CardBody>
          </Card>

          {editable && (
            <div className="flex justify-end">
              <DeleteVideoButton id={v.id} title={v.title} />
            </div>
          )}
          <p className="text-right text-[11px] text-subtle">Created {fmtMoment(v.createdAt)} · In “{v.stage.name}” since {fmtMoment(v.stageChangedAt)}{v.deliveredAt ? ` · Delivered ${fmtMoment(v.deliveredAt)}` : ""}</p>
        </div>
      </div>
    </div>
  );
}
