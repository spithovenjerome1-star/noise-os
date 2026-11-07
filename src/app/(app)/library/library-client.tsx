"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Pencil, Search, Trash2 } from "lucide-react";
import type { LibraryType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { FormDialog, ActionButton } from "@/components/form";
import { Row, SelectField, TextAreaField, TextField } from "@/components/fields";
import { CopyButton } from "@/components/copy-button";
import { LIBRARY_TYPE, options } from "@/lib/labels";
import { saveLibraryItem, deleteLibraryItem } from "@/server/studio/actions";

type Item = { id: string; type: LibraryType; title: string; body: string; tags: string[]; clientId: string | null; clientName: string | null };
type Opt = { value: string; label: string };

export function LibraryDialog({ item, clients, defaultOpen, trigger }: { item?: Item; clients: Opt[]; defaultOpen?: boolean; trigger?: React.ReactNode }) {
  const [open, setOpen] = React.useState(Boolean(defaultOpen));
  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      title={item ? "Edit library item" : "New library item"}
      action={saveLibraryItem}
      wide
      trigger={
        trigger ?? (
          <Button variant="primary" size="sm">
            <Plus /> New item
          </Button>
        )
      }
      danger={
        item ? (
          <ActionButton action={() => deleteLibraryItem(item.id)} variant="danger-ghost" size="sm" confirm={`Delete “${item.title}”?`} onSuccess={() => setOpen(false)}>
            <Trash2 /> Delete
          </ActionButton>
        ) : undefined
      }
    >
      {item && <input type="hidden" name="id" value={item.id} />}
      <Row>
        <SelectField name="type" label="Type" defaultValue={item?.type ?? "HOOK"} options={options(LIBRARY_TYPE)} />
        <SelectField name="clientId" label="Client (optional)" defaultValue={item?.clientId ?? ""} options={clients} placeholder="General" />
      </Row>
      <TextField name="title" label="Title" defaultValue={item?.title} autoFocus placeholder="e.g. “You've been ordering this wrong”" />
      <TextAreaField name="body" label="Content" defaultValue={item?.body} rows={8} />
      <TextField name="tags" label="Tags" defaultValue={item?.tags.join(", ")} placeholder="restaurant, reels, before-after" hint="Comma separated" />
    </FormDialog>
  );
}

export function LibraryCard({ item, clients }: { item: Item; clients: Opt[] }) {
  return (
    <Card className="group flex flex-col p-4 transition-shadow hover:shadow-pop">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-1.5">
            <Badge>{LIBRARY_TYPE[item.type]}</Badge>
            {item.clientName && <span className="truncate text-xs text-subtle">{item.clientName}</span>}
          </div>
          <h3 className="text-[13px] font-semibold leading-snug">{item.title}</h3>
        </div>
        <LibraryDialog
          item={item}
          clients={clients}
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label="Edit">
              <Pencil />
            </Button>
          }
        />
      </div>
      <p className="line-clamp-6 flex-1 whitespace-pre-wrap text-[13px] leading-relaxed text-muted">{item.body}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap gap-1">
          {item.tags.map((t) => (
            <span key={t} className="text-xs text-subtle">#{t}</span>
          ))}
        </div>
        <CopyButton text={item.body} size="sm" variant="ghost" />
      </div>
    </Card>
  );
}

export function LibrarySearch({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = React.useState(defaultValue);
  React.useEffect(() => {
    const t = setTimeout(() => {
      if (q === (sp.get("q") ?? "")) return;
      const p = new URLSearchParams(sp.toString());
      if (q) p.set("q", q);
      else p.delete("q");
      p.delete("new");
      router.replace(`/library${p.toString() ? `?${p}` : ""}`, { scroll: false });
    }, 250);
    return () => clearTimeout(t);
  }, [q, router, sp]);
  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search library" className="pl-8" aria-label="Search library" />
    </div>
  );
}
