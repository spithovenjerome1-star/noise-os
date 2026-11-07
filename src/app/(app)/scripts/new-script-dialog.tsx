"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormDialog } from "@/components/form";
import { SelectField, TextField } from "@/components/fields";
import { createScript } from "@/server/scripts/actions";

export function NewScriptDialog({
  clients,
  videos,
  children,
  defaultOpen,
  defaultClientId,
  defaultVideoId,
}: {
  clients: { value: string; label: string }[];
  videos: { id: string; title: string; clientId: string }[];
  children: React.ReactNode;
  defaultOpen?: boolean;
  defaultClientId?: string;
  defaultVideoId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const preVideo = videos.find((v) => v.id === defaultVideoId);
  const [clientId, setClientId] = useState(preVideo?.clientId ?? defaultClientId ?? "");
  const vids = videos.filter((v) => v.clientId === clientId);
  return (
    <FormDialog
      trigger={children}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o && defaultOpen) router.replace("/scripts", { scroll: false });
      }}
      title="New script"
      description="Link it to a video so approvals show up in production."
      action={createScript}
      submitLabel="Create & open"
      successMessage="Script created"
      onSuccess={(d) => d && router.push(`/scripts/${d.id}`)}
    >
      <TextField name="title" label="Title" placeholder="e.g. Weekend brunch reel" autoFocus defaultValue={preVideo?.title ?? ""} />
      {clients.length === 0 ? (
        <p className="rounded-md bg-surface-2 px-3 py-2 text-[13px] text-muted">Add a client first — every script belongs to a client.</p>
      ) : (
        <SelectField name="clientId" label="Client" placeholder="Choose a client" options={clients} value={clientId} onChange={(e) => setClientId(e.target.value)} />
      )}
      <SelectField
        name="videoId"
        label="Video (optional)"
        placeholder={clientId ? (vids.length ? "Not linked" : "No open videos without a script") : "Choose a client first"}
        options={vids.map((v) => ({ value: v.id, label: v.title }))}
        defaultValue={preVideo?.id ?? ""}
        disabled={!clientId || !vids.length}
        key={clientId}
      />
    </FormDialog>
  );
}
