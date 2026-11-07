import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Columns3, List, CalendarDays, Settings2 } from "lucide-react";
import { requireUser } from "@/server/auth";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { clientOptions, userOptions, stageList } from "@/server/lookups";
import { getSettings } from "@/server/settings";
import { loadVideos } from "@/server/videos/queries";
import { openPeriodOptions } from "@/server/videos/logic";
import { db } from "@/lib/db";
import { todayMalta } from "@/lib/dates";
import { deadlineState } from "@/lib/domain/deadlines";
import { VideoList } from "@/components/videos/list";
import { VideoMonthCalendar } from "@/components/videos/month-calendar";
import { VideosToolbar } from "./videos-toolbar";
import { NewVideoControl, VideosBoardClient } from "./videos-client";
import { EmptyState } from "@/components/ui/misc";
import { Clapperboard } from "lucide-react";

export const metadata = { title: "Production" };

type SP = Record<string, string | undefined>;

export default async function VideosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const view = sp.view === "list" || sp.view === "calendar" ? sp.view : "board";
  const today = todayMalta();
  const settings = await getSettings();

  const where: Prisma.VideoWhereInput = {};
  if (sp.client) where.clientId = sp.client;
  if (sp.assignee) where.assigneeId = sp.assignee === "none" ? null : sp.assignee;
  if (sp.priority && ["URGENT", "HIGH", "NORMAL", "LOW"].includes(sp.priority)) where.priority = sp.priority as Prisma.VideoWhereInput["priority"];
  if (sp.q) where.OR = [{ title: { contains: sp.q, mode: "insensitive" } }, { description: { contains: sp.q, mode: "insensitive" } }, { client: { name: { contains: sp.q, mode: "insensitive" } } }];
  if (sp.hideDelivered === "1") where.stage = { category: { not: "DELIVERED" } };

  const [videosRaw, stages, clients, users, periods, projects, total] = await Promise.all([
    loadVideos(where),
    stageList(),
    clientOptions(),
    userOptions(),
    openPeriodOptions(),
    db.project.findMany({ where: { status: { in: ["ACTIVE", "ON_HOLD"] } }, orderBy: { name: "asc" }, select: { id: true, name: true, clientId: true } }),
    db.video.count(),
  ]);

  let videos = videosRaw;
  if (sp.due) {
    videos = videos.filter((v) => {
      const s = deadlineState(v.deadline, v.category, today, settings.deadlineWarningDays);
      return sp.due === "soon" ? s === "soon" || s === "today" : s === sp.due;
    });
  }

  const formData = {
    clients,
    stages: stages.map((s) => ({ id: s.id, name: s.name })),
    users,
    periods,
    projects: projects.map((p) => ({ value: p.id, label: p.name, clientId: p.clientId })),
  };
  const canCreate = can(user.role, "production:edit");
  const qs = (patch: SP) => {
    const n = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([k, v]) => v && k !== "new") as [string, string][]);
    return `/videos${n.size ? `?${n}` : ""}`;
  };
  const stageInfo = stages.map((s) => ({ id: s.id, name: s.name, color: s.color, category: s.category }));
  const open = videos.filter((v) => v.category !== "DELIVERED");
  const overdue = open.filter((v) => deadlineState(v.deadline, v.category, today, settings.deadlineWarningDays) === "overdue").length;

  return (
    <>
      <PageHeader
        title="Production"
        description={total ? `${open.length} in progress${overdue ? ` · ${overdue} overdue` : ""}` : "Every video, from idea to delivery."}
        actions={
          <>
            <Segmented
              active={view}
              items={[
                { key: "board", label: <><Columns3 /> Board</>, href: qs({ view: undefined }) },
                { key: "list", label: <><List /> List</>, href: qs({ view: "list" }) },
                { key: "calendar", label: <><CalendarDays /> Calendar</>, href: qs({ view: "calendar" }) },
              ]}
            />
            {can(user.role, "settings:manage") && (
              <Button variant="ghost" size="icon" asChild aria-label="Pipeline stages" title="Pipeline stages">
                <Link href="/videos/stages"><Settings2 /></Link>
              </Button>
            )}
            <NewVideoControl formData={formData} canCreate={canCreate} />
          </>
        }
      >
        {total > 0 && <VideosToolbar clients={clients} users={users} />}
      </PageHeader>

      {total === 0 ? (
        <EmptyState
          icon={Clapperboard}
          title="No videos yet"
          description={clients.length ? "Create your first video to start tracking it through the pipeline." : "Add a client first, then create videos for them."}
          action={!clients.length ? <Button asChild variant="primary"><Link href="/clients?new=1">Add client</Link></Button> : <Button asChild variant="primary"><Link href="/videos?new=1">New video</Link></Button>}
        />
      ) : view === "board" ? (
        <VideosBoardClient formData={formData} stages={stageInfo} videos={videos} today={today} warningDays={settings.deadlineWarningDays} canCreate={canCreate} />
      ) : view === "list" ? (
        <VideoList videos={videos} stages={stageInfo} users={users} today={today} warningDays={settings.deadlineWarningDays} />
      ) : (
        <VideoMonthCalendar month={/^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7)} videos={videos} today={today} hrefFor={(m) => qs({ month: m })} />
      )}
    </>
  );
}
