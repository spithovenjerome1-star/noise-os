"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Plus, Repeat, Search, X, CheckSquare, Clapperboard, Trash2 } from "lucide-react";
import type { Priority, Recurrence, TaskStatus } from "@prisma/client";
import { FormDialog, ActionButton } from "@/components/form";
import { TextField, TextAreaField, SelectField, Row } from "@/components/fields";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { PRIORITY, TASK_STATUS, RECURRENCE, options } from "@/lib/labels";
import { BUCKET_ORDER, dueBucket, type TaskView } from "@/lib/domain/tasks";
import { relativeDays } from "@/lib/dates";
import { createTask, updateTask, setTaskStatus, setTaskPriority, deleteTask } from "@/server/tasks/actions";
import { cn } from "@/lib/utils";

export type TaskDTO = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  recurrence: Recurrence;
  clientId: string | null;
  clientName: string | null;
  projectId: string | null;
  projectName: string | null;
  videoId: string | null;
  videoTitle: string | null;
  videoCategory: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
};

type Opt = { value: string; label: string };
type ScopedOpt = Opt & { clientId: string };
type Options = { clients: Opt[]; users: Opt[]; videos: ScopedOpt[]; projects: ScopedOpt[] };

function TaskFields({ task, options: o, defaults }: { task?: TaskDTO | null; options: Options; defaults?: { clientId?: string; videoId?: string; assigneeId?: string } }) {
  const initialClient = task?.clientId ?? defaults?.clientId ?? o.videos.find((v) => v.value === defaults?.videoId)?.clientId ?? "";
  const [clientId, setClientId] = React.useState(initialClient);
  const videos = clientId ? o.videos.filter((v) => v.clientId === clientId) : o.videos;
  const projects = o.projects.filter((p) => p.clientId === clientId);
  return (
    <>
      <TextField name="title" label="Title" defaultValue={task?.title} autoFocus={!task} placeholder="What needs doing?" />
      <TextAreaField name="description" label="Description" defaultValue={task?.description ?? ""} rows={3} />
      <Row>
        <SelectField name="clientId" label="Client" options={o.clients} placeholder="No client" value={clientId} onChange={(e) => setClientId(e.target.value)} />
        <SelectField key={`p-${clientId}`} name="projectId" label="Project" options={projects} placeholder={clientId ? "No project" : "Choose a client first"} defaultValue={task?.projectId ?? ""} disabled={!clientId} />
      </Row>
      <SelectField key={`v-${clientId}`} name="videoId" label="Related video" options={videos} placeholder="None" defaultValue={task?.videoId ?? defaults?.videoId ?? ""} />
      <Row>
        <SelectField name="assigneeId" label="Assigned to" options={o.users} placeholder="Unassigned" defaultValue={task ? (task.assigneeId ?? "") : (defaults?.assigneeId ?? "")} />
        <TextField name="dueDate" type="date" label="Due date" defaultValue={task?.dueDate ?? ""} />
      </Row>
      <Row cols={3}>
        <SelectField name="priority" label="Priority" options={options(PRIORITY)} defaultValue={task?.priority ?? "NORMAL"} />
        <SelectField name="status" label="Status" options={options(TASK_STATUS)} defaultValue={task?.status ?? "TODO"} />
        <SelectField name="recurrence" label="Repeats" options={options(RECURRENCE)} defaultValue={task?.recurrence ?? "NONE"} />
      </Row>
    </>
  );
}

export function TasksClient({
  tasks,
  view,
  today,
  canEdit,
  opened,
  options: o,
  defaults,
}: {
  tasks: TaskDTO[];
  view: TaskView;
  today: string;
  canEdit: boolean;
  opened: TaskDTO | null;
  options: Options;
  defaults: { clientId?: string; videoId?: string; assigneeId?: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = React.useState(sp.get("q") ?? "");
  const [newOpen, setNewOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TaskDTO | null>(null);

  React.useEffect(() => { if (sp.get("new") === "1" && canEdit) setNewOpen(true); }, [sp, canEdit]);
  React.useEffect(() => { if (opened) setEditing(opened); }, [opened]);

  const setParam = React.useCallback((patch: Record<string, string | null>) => {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); }
    router.replace(`${pathname}${n.size ? `?${n}` : ""}`, { scroll: false });
  }, [sp, router, pathname]);

  React.useEffect(() => {
    const t = setTimeout(() => { if ((sp.get("q") ?? "") !== q.trim()) setParam({ q: q.trim() || null }); }, 250);
    return () => clearTimeout(t);
  }, [q, sp, setParam]);

  const groups = new Map<string, TaskDTO[]>();
  for (const t of tasks) {
    const b = dueBucket(t.dueDate, t.status, today);
    groups.set(b, [...(groups.get(b) ?? []), t]);
  }
  const filtersActive = ["q", "client", "assignee", "priority", "status"].some((k) => sp.get(k));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks…" className="pl-8" aria-label="Search tasks" />
        </div>
        <Select aria-label="Client" className="w-auto" value={sp.get("client") ?? ""} onChange={(e) => setParam({ client: e.target.value || null })}>
          <option value="">All clients</option>
          {o.clients.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
        <Select aria-label="Assignee" className="w-auto" value={sp.get("assignee") ?? ""} onChange={(e) => setParam({ assignee: e.target.value || null })}>
          <option value="">Anyone</option>
          <option value="none">Unassigned</option>
          {o.users.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
        </Select>
        <Select aria-label="Priority" className="w-auto" value={sp.get("priority") ?? ""} onChange={(e) => setParam({ priority: e.target.value || null })}>
          <option value="">Any priority</option>
          {Object.entries(PRIORITY).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
        </Select>
        <Select aria-label="Status" className="w-auto" value={sp.get("status") ?? ""} onChange={(e) => setParam({ status: e.target.value || null })}>
          <option value="">Any status</option>
          {Object.entries(TASK_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
        </Select>
        {filtersActive && <Button variant="ghost" size="sm" onClick={() => { setQ(""); setParam({ q: null, client: null, assignee: null, priority: null, status: null }); }}><X /> Clear</Button>}
        {canEdit && (
          <FormDialog
            title="New task"
            action={createTask}
            submitLabel="Create task"
            open={newOpen}
            onOpenChange={(v) => { setNewOpen(v); if (!v && sp.get("new")) setParam({ new: null, video: null, forClient: null }); }}
            trigger={<Button variant="primary" className="ml-auto"><Plus /> New task</Button>}
          >
            <TaskFields options={o} defaults={defaults} />
          </FormDialog>
        )}
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title={filtersActive ? "No tasks match" : view === "today" ? "Nothing due today" : view === "overdue" ? "Nothing overdue" : "No tasks here"}
          description={filtersActive ? "Try clearing the filters." : view === "today" ? "Enjoy it — or plan ahead in “This week”." : "Tasks you create will show up here."}
        />
      ) : (
        <div className="flex flex-col gap-5">
          {BUCKET_ORDER.filter((b) => groups.has(b)).map((b) => (
            <section key={b}>
              <h2 className={cn("mb-1.5 flex items-center gap-2 px-1 text-xs font-medium", b === "Overdue" ? "text-danger" : "text-subtle")}>
                {b} <span className="tabular text-subtle">{groups.get(b)!.length}</span>
              </h2>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-card">
                {groups.get(b)!.map((t) => <TaskRow key={t.id} task={t} today={today} canEdit={canEdit} onOpen={() => setEditing(t)} />)}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <FormDialog
          key={editing.id}
          title="Edit task"
          action={updateTask.bind(null, editing.id)}
          open
          onOpenChange={(v) => { if (!v) { setEditing(null); if (sp.get("task")) setParam({ task: null }); } }}
          danger={canEdit ? (
            <ActionButton variant="danger-ghost" size="sm" confirm="Delete this task?" action={() => deleteTask(editing.id)} onSuccess={() => { setEditing(null); if (sp.get("task")) setParam({ task: null }); }} successMessage="Task deleted">
              <Trash2 /> Delete
            </ActionButton>
          ) : undefined}
        >
          <TaskFields task={editing} options={o} />
        </FormDialog>
      )}
    </div>
  );
}

function TaskRow({ task: t, today, canEdit, onOpen }: { task: TaskDTO; today: string; canEdit: boolean; onOpen: () => void }) {
  const router = useRouter();
  const [done, setDone] = React.useState(t.status === "DONE");
  const [pending, start] = React.useTransition();
  React.useEffect(() => setDone(t.status === "DONE"), [t.status]);
  const overdue = !done && t.dueDate !== null && t.dueDate < today;
  return (
    <li className="group flex items-center gap-3 px-3 py-2 transition-colors hover:bg-surface-2/40 sm:px-4">
      <input
        type="checkbox"
        aria-label={done ? `Reopen ${t.title}` : `Complete ${t.title}`}
        className="size-4 shrink-0 cursor-pointer rounded-full accent-[var(--fg)]"
        checked={done}
        disabled={!canEdit || pending}
        onChange={(e) => {
          const next = e.target.checked;
          setDone(next);
          start(async () => {
            const r = await setTaskStatus(t.id, next ? "DONE" : "TODO");
            if (r.ok) { toast.success(r.message ?? "Saved"); router.refresh(); }
            else { setDone(!next); toast.error(r.error); }
          });
        }}
      />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className={cn("block truncate text-[13px] font-medium transition-colors", done && "text-subtle line-through")}>{t.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          {t.clientName && <span>{t.clientName}</span>}
          {t.projectName && <span className="text-subtle">· {t.projectName}</span>}
          {t.status !== "TODO" && t.status !== "DONE" && <Badge tone={TASK_STATUS[t.status].tone}>{TASK_STATUS[t.status].label}</Badge>}
          {t.recurrence !== "NONE" && <span className="flex items-center gap-1 text-subtle"><Repeat className="size-3" />{RECURRENCE[t.recurrence]}</span>}
        </span>
      </button>
      {t.videoId && (
        <Link href={`/videos/${t.videoId}`} className="hidden max-w-40 items-center gap-1 truncate text-xs text-muted hover:text-fg md:flex" title={t.videoTitle ?? ""}>
          <Clapperboard className="size-3.5 shrink-0" /><span className="truncate">{t.videoTitle}</span>
        </Link>
      )}
      {canEdit ? (
        <Select
          aria-label="Priority"
          value={t.priority}
          className={cn("h-6 w-auto border-transparent bg-transparent py-0 pl-1.5 pr-6 text-xs shadow-none hover:border-border", t.priority === "URGENT" ? "text-danger" : t.priority === "HIGH" ? "text-warning" : "text-muted")}
          onChange={(e) => {
            const p = e.target.value as Priority;
            start(async () => { const r = await setTaskPriority(t.id, p); if (r.ok) router.refresh(); else toast.error(r.error); });
          }}
        >
          {Object.entries(PRIORITY).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
        </Select>
      ) : (
        <Badge tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Badge>
      )}
      <span className={cn("tabular hidden w-20 text-right text-xs sm:block", overdue ? "font-medium text-danger" : "text-muted")}>{t.dueDate ? relativeDays(t.dueDate, today) : ""}</span>
      {t.assigneeName ? <Avatar name={t.assigneeName} className="size-5 text-[9px]" /> : <span className="size-5" />}
    </li>
  );
}
