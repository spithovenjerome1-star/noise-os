import type { Prisma } from "@prisma/client";
import { requireUser } from "@/server/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/misc";
import { LinkTabs } from "@/components/ui/tabs";
import { plainOf, todayMalta, addDaysPlain, dbDate } from "@/lib/dates";
import { TASK_VIEWS, taskInView, type TaskView } from "@/lib/domain/tasks";
import { clientOptions, userOptions } from "@/server/lookups";
import { TasksClient, type TaskDTO } from "./tasks-client";

export const metadata = { title: "Tasks" };

type SP = Record<string, string | undefined>;

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const view = (TASK_VIEWS.some((v) => v.key === sp.view) ? sp.view : "today") as TaskView;
  const today = todayMalta();

  const filter: Prisma.TaskWhereInput = {};
  if (sp.client) filter.clientId = sp.client;
  if (sp.assignee) filter.assigneeId = sp.assignee === "none" ? null : sp.assignee;
  if (sp.priority && ["URGENT", "HIGH", "NORMAL", "LOW"].includes(sp.priority)) filter.priority = sp.priority as Prisma.TaskWhereInput["priority"];
  if (sp.status && ["TODO", "IN_PROGRESS", "WAITING_CLIENT", "DONE"].includes(sp.status)) filter.status = sp.status as Prisma.TaskWhereInput["status"];
  if (sp.q) filter.OR = [{ title: { contains: sp.q, mode: "insensitive" } }, { description: { contains: sp.q, mode: "insensitive" } }];

  // Open tasks + tasks completed in the last 30 days (older history stays searchable via ?status=DONE).
  const recentDone = new Date(dbDate(addDaysPlain(today, -30)).getTime());
  const include = {
    client: { select: { id: true, name: true } },
    project: { select: { id: true, name: true } },
    assignee: { select: { id: true, name: true } },
    video: { select: { id: true, title: true, stage: { select: { category: true } } } },
  } satisfies Prisma.TaskInclude;
  const [rows, opened, clients, users, videos, projects] = await Promise.all([
    db.task.findMany({
      where: { AND: [filter, sp.status === "DONE" ? {} : { OR: [{ status: { not: "DONE" } }, { completedAt: { gte: recentDone } }] }] },
      include,
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: 1000,
    }),
    sp.task ? db.task.findUnique({ where: { id: sp.task }, include }) : null,
    clientOptions(),
    userOptions(),
    db.video.findMany({ where: { stage: { category: { not: "DELIVERED" } } }, orderBy: { title: "asc" }, select: { id: true, title: true, clientId: true }, take: 500 }),
    db.project.findMany({ where: { status: { in: ["ACTIVE", "ON_HOLD"] } }, orderBy: { name: "asc" }, select: { id: true, name: true, clientId: true } }),
  ]);

  const toDTO = (t: (typeof rows)[number]): TaskDTO => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    dueDate: plainOf(t.dueDate),
    recurrence: t.recurrence,
    clientId: t.clientId,
    clientName: t.client?.name ?? null,
    projectId: t.projectId,
    projectName: t.project?.name ?? null,
    videoId: t.videoId,
    videoTitle: t.video?.title ?? null,
    videoCategory: t.video?.stage.category ?? null,
    assigneeId: t.assigneeId,
    assigneeName: t.assignee?.name ?? null,
  });
  const all = rows.map(toDTO);
  const inView = (t: TaskDTO, v: TaskView) => taskInView({ status: t.status, dueDate: t.dueDate, videoCategory: t.videoCategory, hasVideo: Boolean(t.videoId) }, v, today);
  const tasks = all.filter((t) => inView(t, view));
  const counts = Object.fromEntries(TASK_VIEWS.map((v) => [v.key, all.filter((t) => inView(t, v.key) && (v.key === "all" ? t.status !== "DONE" : true)).length]));

  const qs = (patch: SP) => {
    const n = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([k, v]) => v && k !== "new" && k !== "task") as [string, string][]);
    return `/tasks${n.size ? `?${n}` : ""}`;
  };
  // Keep the opened task's links selectable even if done/delivered.
  if (opened?.video && !videos.some((v) => v.id === opened.video!.id)) videos.push({ id: opened.video.id, title: opened.video.title, clientId: opened.clientId ?? "" });

  return (
    <>
      <PageHeader title="Tasks" description={`${counts.today} for today${counts.overdue ? ` · ${counts.overdue} overdue` : ""}`}>
        <LinkTabs active={view} tabs={TASK_VIEWS.map((v) => ({ key: v.key, label: v.label, href: qs({ view: v.key === "today" ? undefined : v.key }), count: counts[v.key] }))} />
      </PageHeader>
      <TasksClient
        tasks={tasks}
        view={view}
        today={today}
        canEdit={can(user.role, "production:edit")}
        opened={opened ? toDTO(opened) : null}
        options={{
          clients,
          users,
          videos: videos.map((v) => ({ value: v.id, label: v.title, clientId: v.clientId })),
          projects: projects.map((p) => ({ value: p.id, label: p.name, clientId: p.clientId })),
        }}
        defaults={{ clientId: sp.client ?? sp.forClient, videoId: sp.video, assigneeId: user.id }}
      />
    </>
  );
}
