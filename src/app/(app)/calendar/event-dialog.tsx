"use client";
import * as React from "react";
import { Trash2 } from "lucide-react";
import { FormDialog, ActionButton, useFieldError } from "@/components/form";
import { Row, SelectField, TextAreaField, TextField } from "@/components/fields";
import { EVENT_TYPE } from "@/lib/labels";
import { addDaysPlain } from "@/lib/dates";
import { saveEvent, deleteEvent } from "@/server/calendar/actions";
import type { CalOptions, EventPayload } from "./types";

export type DialogState = { mode: "new"; type: EventPayload["type"]; date: string; startMin: number; clientId?: string } | { mode: "edit"; event: EventPayload };

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const TYPES = (["SHOOT", "MEETING", "MILESTONE", "DELIVERY", "OTHER"] as const).map((k) => ({ value: k, label: EVENT_TYPE[k].label }));

export function EventDialog({ state, options, onClose }: { state: DialogState; options: CalOptions; onClose: () => void }) {
  const ev = state.mode === "edit" ? state.event : null;
  const defaultStart = state.mode === "new" ? `${state.date}T${hhmm(state.startMin)}` : ev!.startsLocal;
  const defaultEnd =
    state.mode === "new"
      ? state.startMin + (state.type === "SHOOT" ? 180 : 60) >= 1440
        ? `${addDaysPlain(state.date, 1)}T00:00`
        : `${state.date}T${hhmm(state.startMin + (state.type === "SHOOT" ? 180 : 60))}`
      : ev!.endsLocal;
  const [allDay, setAllDay] = React.useState(ev?.allDay ?? false);
  const [clientId, setClientId] = React.useState(ev?.clientId ?? (state.mode === "new" ? state.clientId ?? "" : ""));
  const [equip, setEquip] = React.useState<string[]>(ev?.equipmentIds ?? []);
  const projects = options.projects.filter((p) => !clientId || p.clientId === clientId);
  const videos = options.videos.filter((v) => !clientId || v.clientId === clientId);

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={ev ? "Edit event" : "New event"}
      action={saveEvent}
      submitLabel={ev ? "Save" : "Schedule"}
      wide
      danger={
        ev ? (
          <ActionButton action={() => deleteEvent(ev.id)} variant="danger-ghost" size="sm" confirm={`Delete “${ev.title}”?`} onSuccess={onClose}>
            <Trash2 /> Delete
          </ActionButton>
        ) : undefined
      }
    >
      {ev && <input type="hidden" name="id" value={ev.id} />}
      <Row>
        <TextField name="title" label="Title" defaultValue={ev?.title} placeholder="e.g. Menu shoot at Bistro" autoFocus />
        <SelectField name="type" label="Type" defaultValue={ev?.type ?? (state.mode === "new" ? state.type : "OTHER")} options={TYPES} />
      </Row>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" name="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="size-4 accent-[var(--fg)]" />
        All day
      </label>
      {allDay ? (
        <Row>
          <TextField name="startDate" type="date" label="Start date" defaultValue={ev?.startDate ?? defaultStart.slice(0, 10)} />
          <TextField name="endDate" type="date" label="End date" defaultValue={ev?.endDate ?? defaultStart.slice(0, 10)} />
        </Row>
      ) : (
        <Row>
          <TextField name="startsAt" type="datetime-local" label="Starts (Malta time)" defaultValue={defaultStart} />
          <TextField name="endsAt" type="datetime-local" label="Ends" defaultValue={defaultEnd} />
        </Row>
      )}
      <TextField name="location" label="Location" defaultValue={ev?.location} placeholder="Address or venue" />
      <Row cols={3}>
        <SelectField name="clientId" label="Client" value={clientId} onChange={(e) => setClientId(e.target.value)} options={options.clients} placeholder="No client" />
        <SelectField name="projectId" label="Project" defaultValue={ev?.projectId} options={projects} placeholder="None" />
        <SelectField name="videoId" label="Video" defaultValue={ev?.videoId} options={videos} placeholder="None" />
      </Row>
      {options.equipment.length > 0 && <EquipmentPicker equipment={options.equipment} value={equip} onChange={setEquip} />}
      <TextAreaField name="notes" label="Notes" defaultValue={ev?.notes} rows={3} placeholder="Call time, shot list link, parking…" />
    </FormDialog>
  );
}

function EquipmentPicker({ equipment, value, onChange }: { equipment: CalOptions["equipment"]; value: string[]; onChange: (v: string[]) => void }) {
  const error = useFieldError("equipment");
  const groups = equipment.reduce<Record<string, typeof equipment>>((acc, g) => {
    (acc[g.clientId ?? "Other"] ??= []).push(g);
    return acc;
  }, {});
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">Equipment</span>
      <div className="flex max-h-40 flex-col gap-2 overflow-y-auto rounded-md border border-border p-2.5">
        {Object.entries(groups).map(([cat, items]) => (
          <div key={cat}>
            <div className="mb-1 text-[11px] text-subtle">{cat}</div>
            <div className="flex flex-wrap gap-1.5">
              {items.map((g) => {
                const on = value.includes(g.value);
                return (
                  <label key={g.value} className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${on ? "border-fg bg-fg text-bg" : "border-border hover:bg-surface-2"}`}>
                    <input type="checkbox" name="equipmentIds" value={g.value} checked={on} onChange={(e) => onChange(e.target.checked ? [...value, g.value] : value.filter((x) => x !== g.value))} className="sr-only" />
                    {g.label}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {error && (
        <div className="rounded-md bg-warning-bg px-2.5 py-2 text-xs text-warning">
          {error}
          <label className="mt-1.5 flex items-center gap-2 font-medium">
            <input type="checkbox" name="allowConflict" className="size-3.5" /> Book anyway
          </label>
        </div>
      )}
    </div>
  );
}
