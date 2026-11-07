"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { FormDialog, ActionForm, SubmitButton } from "@/components/form";
import { TextField, SelectField, TextAreaField, CheckboxField, Row } from "@/components/fields";
import { createVideo, updateVideo } from "@/server/videos/actions";
import { PRIORITY, options } from "@/lib/labels";
import type { VideoDTO } from "@/server/videos/queries";

export type Opt = { value: string; label: string };
export type ClientScopedOpt = Opt & { clientId: string };

export type VideoFormData = {
  clients: Opt[];
  stages: { id: string; name: string }[];
  users: Opt[];
  periods: ClientScopedOpt[];
  projects: ClientScopedOpt[];
};

function Fields({ data, video, defaults }: { data: VideoFormData; video?: VideoDTO; defaults?: { clientId?: string; stageId?: string } }) {
  const [clientId, setClientId] = React.useState(video?.clientId ?? defaults?.clientId ?? "");
  const [override, setOverride] = React.useState(video?.deadlineOverridden ?? false);
  const [filmedOn, setFilmedOn] = React.useState(video?.filmedOn ?? "");
  const periods = data.periods.filter((p) => p.clientId === clientId);
  // Keep a currently linked (maybe closed) period selectable when editing.
  if (video?.packagePeriodId && video.clientId === clientId && !periods.some((p) => p.value === video.packagePeriodId))
    periods.unshift({ value: video.packagePeriodId, label: `${video.packageName ?? "Package"} (closed period)`, clientId });
  const projects = data.projects.filter((p) => p.clientId === clientId);
  const auto = !override && Boolean(filmedOn);

  return (
    <>
      <TextField name="title" label="Title" defaultValue={video?.title} placeholder="e.g. Weekend brunch reel" autoFocus={!video} />
      <Row>
        <SelectField name="clientId" label="Client" options={data.clients} placeholder="Choose client…" value={clientId} onChange={(e) => setClientId(e.target.value)} />
        <SelectField name="stageId" label="Stage" options={data.stages.map((s) => ({ value: s.id, label: s.name }))} defaultValue={video?.stageId ?? defaults?.stageId ?? data.stages[0]?.id} />
      </Row>
      <Row>
        <SelectField
          key={`p-${clientId}`}
          name="packagePeriodId"
          label="Package period"
          options={periods}
          placeholder={clientId ? (periods.length ? "Not linked to a package" : "No open package periods") : "Choose a client first"}
          defaultValue={video?.packagePeriodId ?? (periods.length === 1 ? periods[0]!.value : "")}
          disabled={!clientId}
        />
        <SelectField key={`pr-${clientId}`} name="projectId" label="Project" options={projects} placeholder="No project" defaultValue={video?.projectId ?? ""} disabled={!clientId} />
      </Row>
      <CheckboxField name="isExtra" label="Extra video (outside the package)" hint="Not counted against the package's included videos." defaultChecked={video?.isExtra} />
      <TextAreaField name="description" label="Description" defaultValue={video?.description ?? ""} rows={3} />
      <Row cols={3}>
        <TextField name="shootDate" type="datetime-local" label="Shoot date" defaultValue={video?.shootLocal ?? ""} hint="Malta time. Adds a shoot to the calendar." />
        <TextField name="filmedOn" type="date" label="Filmed on" value={filmedOn} onChange={(e) => setFilmedOn(e.target.value)} />
        <TextField
          key={auto ? `auto-${filmedOn}` : "manual"}
          name="deadline"
          type="date"
          label="Delivery deadline"
          defaultValue={auto ? (filmedOn === video?.filmedOn ? (video?.deadline ?? "") : "") : (video?.deadline ?? "")}
          disabled={auto}
          placeholder={auto ? "Automatic" : undefined}
          hint={auto ? "Automatic: filmed date + turnaround days" : override ? "Manual deadline" : "Set when filmed, or enter one"}
        />
      </Row>
      <label className="flex cursor-pointer items-center gap-2 text-[13px]">
        <input type="checkbox" name="deadlineOverridden" checked={override} onChange={(e) => setOverride(e.target.checked)} className="size-4 accent-[var(--fg)]" />
        Override the automatic deadline
      </label>
      <Row>
        <SelectField name="assigneeId" label="Assigned editor" options={data.users} placeholder="Unassigned" defaultValue={video?.assigneeId ?? ""} />
        <SelectField name="priority" label="Priority" options={options(PRIORITY)} defaultValue={video?.priority ?? "NORMAL"} />
      </Row>
      <Row>
        <TextField name="footageUrl" label="Footage link" defaultValue={video?.footageUrl ?? ""} placeholder="Drive / Frame.io…" />
        <TextField name="premiereUrl" label="Premiere Pro project" defaultValue={video?.premiereUrl ?? ""} placeholder="Path or link" />
      </Row>
      <Row>
        <TextField name="reviewUrl" label="Review link" defaultValue={video?.reviewUrl ?? ""} />
        <TextField name="deliveryUrl" label="Final delivery link" defaultValue={video?.deliveryUrl ?? ""} />
      </Row>
      <TextAreaField name="revisionNotes" label="Revision notes" defaultValue={video?.revisionNotes ?? ""} rows={3} />
    </>
  );
}

export function NewVideoDialog({
  data,
  trigger,
  open,
  onOpenChange,
  defaults,
}: {
  data: VideoFormData;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  defaults?: { clientId?: string; stageId?: string };
}) {
  const router = useRouter();
  return (
    <FormDialog
      title="New video"
      description="Deadlines are set automatically 7 days after filming unless you override them."
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      action={createVideo}
      submitLabel="Create video"
      wide
      onSuccess={(d) => d && router.push(`/videos/${d.id}`)}
    >
      <Fields data={data} defaults={defaults} />
    </FormDialog>
  );
}

export function EditVideoForm({ data, video }: { data: VideoFormData; video: VideoDTO }) {
  return (
    <ActionForm action={updateVideo.bind(null, video.id)} className="flex flex-col gap-4">
      <Fields data={data} video={video} />
      <div className="flex justify-end">
        <SubmitButton>Save changes</SubmitButton>
      </div>
    </ActionForm>
  );
}
