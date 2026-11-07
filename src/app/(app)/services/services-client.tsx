"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ActionForm, FormDialog, SubmitButton, ActionButton } from "@/components/form";
import { CheckboxField, MoneyField, Row, TextAreaField, TextField } from "@/components/fields";
import { createService, updateService, toggleServicePublished, moveService, deleteService, updatePublicSite } from "@/server/services/actions";
import { centsToInput, formatMoney } from "@/lib/money";
import { formatDuration } from "@/lib/domain/bookings";

type Svc = { id: string; name: string; slug: string; summary: string | null; description: string | null; fromCents: number | null; priceNote: string | null; durationMin: number | null; bookable: boolean; published: boolean; bookings: number };

function ServiceFields({ s }: { s?: Svc }) {
  return (
    <>
      <TextField name="name" label="Name" defaultValue={s?.name} placeholder="e.g. Monthly reels package" autoFocus />
      <TextField name="summary" label="Short summary" defaultValue={s?.summary ?? ""} placeholder="One line shown under the name" />
      <TextAreaField name="description" label="Description" defaultValue={s?.description ?? ""} rows={4} />
      <Row cols={3}>
        <MoneyField name="fromCents" label="From price" defaultValue={centsToInput(s?.fromCents)} hint="Leave empty to hide" />
        <TextField name="priceNote" label="Price note" defaultValue={s?.priceNote ?? ""} placeholder="e.g. excl. VAT" />
        <TextField name="durationMin" label="Duration (min)" type="number" min={0} defaultValue={s?.durationMin ?? ""} />
      </Row>
      <TextField name="slug" label="URL slug" defaultValue={s?.slug ?? ""} hint="Optional. Used for direct links like /book?service=reels" />
      <div className="flex flex-col gap-2">
        <CheckboxField name="published" label="Show on booking page" defaultChecked={s?.published ?? false} />
        <CheckboxField name="bookable" label="Can be booked" hint="Untick to show it as information only" defaultChecked={s?.bookable ?? true} />
      </div>
    </>
  );
}

export function ServiceDialog({ defaultOpen, label = "Add service" }: { defaultOpen?: boolean; label?: string }) {
  const [open, setOpen] = React.useState(Boolean(defaultOpen));
  const router = useRouter();
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o && defaultOpen) router.replace("/services", { scroll: false });
      }}
      trigger={<Button variant="primary"><Plus /> {label}</Button>}
      title="New service"
      action={createService}
      submitLabel="Add service"
      wide
    >
      <ServiceFields />
    </FormDialog>
  );
}

export function ServiceRow({ service: s, first, last }: { service: Svc; first: boolean; last: boolean }) {
  const [edit, setEdit] = React.useState(false);
  const router = useRouter();
  const [pub, setPub] = React.useState(s.published);
  React.useEffect(() => setPub(s.published), [s.published]);
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex flex-col">
        <ActionButton variant="ghost" size="icon-sm" disabled={first} action={() => moveService(s.id, -1)} successMessage={false} aria-label="Move up"><ArrowUp /></ActionButton>
        <ActionButton variant="ghost" size="icon-sm" disabled={last} action={() => moveService(s.id, 1)} successMessage={false} aria-label="Move down"><ArrowDown /></ActionButton>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{s.name}</span>
          {!s.bookable && <Badge>Info only</Badge>}
          {s.bookings > 0 && <Badge tone="info">{s.bookings} request{s.bookings > 1 ? "s" : ""}</Badge>}
        </div>
        <div className="truncate text-xs text-muted">
          {[s.fromCents !== null ? `From ${formatMoney(s.fromCents)}` : null, formatDuration(s.durationMin), s.summary].filter(Boolean).join(" · ") || "No details yet"}
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted">
        <span className="hidden sm:inline">{pub ? "Published" : "Hidden"}</span>
        <Switch
          checked={pub}
          aria-label="Published"
          onCheckedChange={async (v) => {
            setPub(v);
            const r = await toggleServicePublished(s.id, v);
            if (r.ok) {
              toast.success(r.message ?? "Saved");
              router.refresh();
            } else {
              setPub(!v);
              toast.error(r.error);
            }
          }}
        />
      </label>
      <Button variant="ghost" size="icon-sm" onClick={() => setEdit(true)} aria-label="Edit service"><Pencil /></Button>
      <FormDialog
        open={edit}
        onOpenChange={setEdit}
        title={`Edit ${s.name}`}
        action={(fd) => updateService(s.id, fd)}
        wide
        danger={
          <ActionButton variant="danger-ghost" action={() => deleteService(s.id)} confirm={`Delete “${s.name}”? It will disappear from your booking page.`} onSuccess={() => setEdit(false)}>
            <Trash2 /> Delete
          </ActionButton>
        }
      >
        <ServiceFields s={s} />
      </FormDialog>
    </div>
  );
}

export function PublicSiteForm({ settings }: { settings: { publicSiteEnabled: boolean; publicTagline: string | null; publicAbout: string | null; instagramUrl: string | null } }) {
  return (
    <ActionForm action={updatePublicSite} className="flex flex-col gap-3" successMessage="Booking page updated">
      <CheckboxField name="publicSiteEnabled" label="Accept booking requests" hint="Turn off to show “Bookings are closed”." defaultChecked={settings.publicSiteEnabled} />
      <TextField name="publicTagline" label="Headline" defaultValue={settings.publicTagline ?? ""} placeholder="Video that makes people stop scrolling." />
      <TextAreaField name="publicAbout" label="About" defaultValue={settings.publicAbout ?? ""} rows={4} placeholder="A short intro to NOISE." />
      <TextField name="instagramUrl" label="Instagram URL" defaultValue={settings.instagramUrl ?? ""} placeholder="instagram.com/noise.mt" />
      <div className="flex justify-end"><SubmitButton>Save</SubmitButton></div>
    </ActionForm>
  );
}
