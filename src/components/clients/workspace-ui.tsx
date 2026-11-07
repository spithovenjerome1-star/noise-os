"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Pin, PinOff, Plus, Trash2, Link2, Star } from "lucide-react";
import { toast } from "sonner";
import { ActionButton, ActionForm, FormDialog, SubmitButton } from "@/components/form";
import { CheckboxField, MoneyField, Row, SelectField, TextAreaField, TextField } from "@/components/fields";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { CopyButton } from "@/components/copy-button";
import { ClientFormDialog, type ClientDefaults } from "./client-form";
import {
  deleteClient, setClientArchived, saveContact, deleteContact, saveProject, deleteProject, saveNote, toggleNotePin, deleteNote,
  saveTimeEntry, deleteTimeEntry, createPortalLink, revokePortalLink,
} from "@/server/clients/actions";
import { PROJECT_STATUS, options } from "@/lib/labels";
import { cn } from "@/lib/utils";

// ───────── Header actions ─────────
export function ClientHeaderActions({ client, canEdit, canDelete, canFinance, invoiceCount }: { client: ClientDefaults & { archived: boolean }; canEdit: boolean; canDelete: boolean; canFinance: boolean; invoiceCount: number }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  if (!canEdit) return null;
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? "Done");
        after ? after() : router.refresh();
      } else toast.error(r.error);
    });
  return (
    <>
      <ClientFormDialog
        client={client}
        canFinance={canFinance}
        trigger={
          <Button>
            <Pencil /> Edit
          </Button>
        }
      />
      <Dropdown>
        <DropdownTrigger asChild>
          <Button size="icon" aria-label="More actions" loading={pending}>
            <MoreHorizontal />
          </Button>
        </DropdownTrigger>
        <DropdownContent>
          {client.archived ? (
            <DropdownItem onSelect={() => run(() => setClientArchived(client.id, false))}>
              <ArchiveRestore /> Restore from archive
            </DropdownItem>
          ) : (
            <DropdownItem
              onSelect={() => {
                if (confirm(`Archive ${client.name}? All history (videos, invoices, notes) is kept and you can restore it any time.`)) run(() => setClientArchived(client.id, true));
              }}
            >
              <Archive /> Archive client
            </DropdownItem>
          )}
          {canDelete && (
            <>
              <DropdownSeparator />
              <DropdownItem
                danger
                disabled={invoiceCount > 0}
                onSelect={() => {
                  if (confirm(`Permanently delete ${client.name} and all their videos, scripts, notes and files? This cannot be undone.`))
                    run(() => deleteClient(client.id), () => router.push("/clients"));
                }}
              >
                <Trash2 /> {invoiceCount > 0 ? "Delete (has invoices — archive instead)" : "Delete permanently"}
              </DropdownItem>
            </>
          )}
        </DropdownContent>
      </Dropdown>
    </>
  );
}

// ───────── Contacts ─────────
export type ContactRow = { id: string; name: string; role: string | null; email: string | null; phone: string | null; isPrimary: boolean };

export function ContactDialog({ clientId, contact, trigger }: { clientId: string; contact?: ContactRow; trigger: React.ReactNode }) {
  return (
    <FormDialog
      trigger={trigger}
      title={contact ? "Edit contact" : "Add contact"}
      action={saveContact.bind(null, clientId, contact?.id ?? null)}
      danger={
        contact ? (
          <ActionButton variant="danger-ghost" size="sm" action={() => deleteContact(contact.id)} confirm={`Remove ${contact.name}?`}>
            <Trash2 /> Remove
          </ActionButton>
        ) : undefined
      }
    >
      <Row>
        <TextField name="name" label="Name *" defaultValue={contact?.name} autoFocus />
        <TextField name="role" label="Role" defaultValue={contact?.role ?? ""} placeholder="Owner, marketing…" />
      </Row>
      <Row>
        <TextField name="email" type="email" label="Email" defaultValue={contact?.email ?? ""} />
        <TextField name="phone" type="tel" label="Phone" defaultValue={contact?.phone ?? ""} />
      </Row>
      <CheckboxField name="isPrimary" label="Primary contact" defaultChecked={contact?.isPrimary} />
    </FormDialog>
  );
}

// ───────── Projects ─────────
export type ProjectRow = { id: string; name: string; description: string | null; status: string; startDate: string | null; dueDate: string | null; budgetCents: number | null };

export function ProjectDialog({ clientId, project, trigger, canFinance }: { clientId: string; project?: ProjectRow; trigger: React.ReactNode; canFinance: boolean }) {
  return (
    <FormDialog
      trigger={trigger}
      title={project ? "Edit project" : "New project"}
      action={saveProject.bind(null, clientId, project?.id ?? null)}
      danger={
        project ? (
          <ActionButton variant="danger-ghost" size="sm" action={() => deleteProject(project.id)} confirm={`Delete project “${project.name}”? Linked videos, tasks and invoices are kept.`}>
            <Trash2 /> Delete
          </ActionButton>
        ) : undefined
      }
    >
      <TextField name="name" label="Project name *" defaultValue={project?.name} autoFocus placeholder="e.g. Summer menu launch" />
      <TextAreaField name="description" label="Description" rows={2} defaultValue={project?.description ?? ""} />
      <Row cols={3}>
        <SelectField name="status" label="Status" options={options(PROJECT_STATUS)} defaultValue={project?.status ?? "ACTIVE"} />
        <TextField name="startDate" type="date" label="Start" defaultValue={project?.startDate ?? ""} />
        <TextField name="dueDate" type="date" label="Due" defaultValue={project?.dueDate ?? ""} />
      </Row>
      {canFinance ? (
        <MoneyField name="budgetCents" label="Budget" defaultValue={project?.budgetCents != null ? (project.budgetCents / 100).toFixed(2) : ""} />
      ) : (
        <input type="hidden" name="budgetCents" value={project?.budgetCents != null ? (project.budgetCents / 100).toFixed(2) : ""} />
      )}
    </FormDialog>
  );
}

// ───────── Notes ─────────
export type NoteRow = { id: string; body: string; pinned: boolean; author: string | null; createdAt: string; updatedAt: string };

export function NoteComposer({ clientId }: { clientId: string }) {
  return (
    <ActionForm action={saveNote.bind(null, clientId, null)} resetOnSuccess successMessage="Note added" className="flex flex-col gap-2">
      <TextAreaField name="body" placeholder="Write a note… (meeting notes, preferences, ideas)" rows={3} />
      <div className="flex items-center justify-between">
        <CheckboxField name="pinned" label="Pin to top" />
        <SubmitButton size="sm">Add note</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function NoteItem({ note, clientId }: { note: NoteRow; clientId: string }) {
  const [editing, setEditing] = React.useState(false);
  if (editing)
    return (
      <ActionForm action={saveNote.bind(null, clientId, note.id)} onSuccess={() => setEditing(false)} successMessage="Note updated" className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <TextAreaField name="body" defaultValue={note.body} rows={4} autoFocus />
        <input type="hidden" name="pinned" value={note.pinned ? "on" : ""} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
          <SubmitButton size="sm" />
        </div>
      </ActionForm>
    );
  return (
    <div className={cn("group rounded-lg border border-border p-3", note.pinned && "border-warning/40 bg-warning-bg/40")}>
      <div className="mb-1.5 flex items-center gap-2 text-xs text-subtle">
        {note.pinned && <Pin className="size-3 text-warning" />}
        <span>{note.author ?? "Unknown"}</span>
        <span>·</span>
        <span>{note.createdAt}</span>
        <div className="ml-auto flex opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          <ActionButton variant="ghost" size="icon-sm" aria-label={note.pinned ? "Unpin" : "Pin"} action={() => toggleNotePin(note.id, !note.pinned)} successMessage={false}>
            {note.pinned ? <PinOff /> : <Pin />}
          </ActionButton>
          <Button variant="ghost" size="icon-sm" aria-label="Edit note" onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
          <ActionButton variant="ghost" size="icon-sm" aria-label="Delete note" action={() => deleteNote(note.id)} confirm="Delete this note?">
            <Trash2 />
          </ActionButton>
        </div>
      </div>
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{note.body}</p>
    </div>
  );
}

// ───────── Time entries ─────────
export type TimeRow = { id: string; date: string; minutes: number; note: string | null; videoId: string | null };

export function TimeEntryDialog({ clientId, entry, videos, trigger, today }: { clientId: string; entry?: TimeRow; videos: { value: string; label: string }[]; trigger: React.ReactNode; today: string }) {
  return (
    <FormDialog
      trigger={trigger}
      title={entry ? "Edit time entry" : "Log time"}
      description="Used to estimate effective hourly earnings per client."
      action={saveTimeEntry.bind(null, clientId, entry?.id ?? null)}
      danger={
        entry ? (
          <ActionButton variant="danger-ghost" size="sm" action={() => deleteTimeEntry(entry.id)} confirm="Delete this time entry?">
            <Trash2 /> Delete
          </ActionButton>
        ) : undefined
      }
    >
      <Row cols={3}>
        <TextField name="date" type="date" label="Date" defaultValue={entry?.date ?? today} />
        <TextField name="hours" type="number" step="0.25" min={0} label="Hours" defaultValue={entry ? Math.floor(entry.minutes / 60) : ""} />
        <TextField name="minutes" type="number" min={0} max={59} label="Minutes" defaultValue={entry ? entry.minutes % 60 : ""} />
      </Row>
      <SelectField name="videoId" label="Video (optional)" options={videos} placeholder="— Not linked to a video —" defaultValue={entry?.videoId ?? ""} />
      <TextField name="note" label="What was done" defaultValue={entry?.note ?? ""} placeholder="Shoot, editing, revisions…" />
    </FormDialog>
  );
}

// ───────── Portal links ─────────
export function CreatePortalLink({ clientId }: { clientId: string }) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        trigger={
          <Button variant="primary">
            <Link2 /> Create portal link
          </Button>
        }
        title="Create client portal link"
        description="Anyone with this link can see this client's shared scripts, video progress, deliverables and invoice status — never internal notes or costs."
        submitLabel="Create link"
        action={createPortalLink.bind(null, clientId)}
        onSuccess={(d) => setUrl((d as { url: string }).url)}
      >
        <TextField name="label" label="Label" placeholder="e.g. Marketing team" hint="Helps you recognise the link later." />
        <SelectField
          name="expiresInDays"
          label="Expires"
          defaultValue="90"
          options={[
            { value: "7", label: "In 7 days" },
            { value: "30", label: "In 30 days" },
            { value: "90", label: "In 90 days" },
            { value: "365", label: "In 1 year" },
            { value: "", label: "Never (revoke manually)" },
          ]}
        />
      </FormDialog>
      {url && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-success/30 bg-success-bg p-3">
          <div className="flex items-center gap-2 text-[13px] font-medium text-success">
            <Star className="size-4" /> Copy this link now — for security it won&apos;t be shown again.
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-xs">{url}</code>
            <CopyButton text={url} label="Copy link" variant="primary" size="sm" />
            <Button size="sm" variant="ghost" onClick={() => setUrl(null)}>Done</Button>
          </div>
        </div>
      )}
    </>
  );
}

export function RevokePortalLink({ id }: { id: string }) {
  return (
    <ActionButton size="sm" variant="danger-ghost" action={() => revokePortalLink(id)} confirm="Revoke this link? Anyone using it will lose access immediately.">
      Revoke
    </ActionButton>
  );
}

export function AddButton({ children }: { children: React.ReactNode }) {
  return (
    <Button size="sm" variant="ghost">
      <Plus /> {children}
    </Button>
  );
}

export { Badge };
