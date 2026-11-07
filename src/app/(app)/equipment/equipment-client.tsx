"use client";
import * as React from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import type { EquipmentStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { FormDialog, ActionButton } from "@/components/form";
import { MoneyField, Row, SelectField, TextAreaField, TextField } from "@/components/fields";
import { EQUIPMENT_STATUS, options } from "@/lib/labels";
import { centsToInput } from "@/lib/money";
import { saveEquipment, deleteEquipment } from "@/server/studio/actions";

type Item = { id: string; name: string; category: string; serialNumber: string | null; purchasedOn: string | null; purchaseCents: number | null; status: EquipmentStatus; notes: string | null };

const DEFAULT_CATEGORIES = ["Cameras", "Lenses", "Audio", "Lighting", "Grip & support", "Drones", "Storage", "Accessories"];

export function EquipmentDialog({
  item,
  categories,
  canSetPrice,
  showPrice,
  upcoming,
  row,
  defaultOpen,
}: {
  item?: Item;
  categories: string[];
  canSetPrice: boolean;
  showPrice: boolean;
  upcoming?: { id: string; title: string; when: string; client: string | null }[];
  row?: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(Boolean(defaultOpen));
  const cats = [...new Set([...categories, ...DEFAULT_CATEGORIES])];
  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      title={item ? item.name : "Add equipment"}
      action={saveEquipment}
      trigger={
        row ? (
          <button type="button" className="block w-full">{row}</button>
        ) : (
          <Button variant="primary" size="sm">
            <Plus /> Add equipment
          </Button>
        )
      }
      danger={
        item ? (
          <ActionButton action={() => deleteEquipment(item.id)} variant="danger-ghost" size="sm" confirm={`Delete ${item.name}? Past shoot assignments are removed too. Consider “Retired” instead.`} onSuccess={() => setOpen(false)}>
            <Trash2 /> Delete
          </ActionButton>
        ) : undefined
      }
    >
      {item && <input type="hidden" name="id" value={item.id} />}
      <Row>
        <TextField name="name" label="Name" defaultValue={item?.name} placeholder="Sony FX3" autoFocus={!item} />
        <TextField name="category" label="Category" defaultValue={item?.category ?? ""} list="equipment-categories" placeholder="Cameras" />
      </Row>
      <datalist id="equipment-categories">
        {cats.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <Row>
        <TextField name="serialNumber" label="Serial number" defaultValue={item?.serialNumber ?? ""} />
        <SelectField name="status" label="Status" defaultValue={item?.status ?? "AVAILABLE"} options={options(EQUIPMENT_STATUS)} />
      </Row>
      <Row>
        <TextField name="purchasedOn" type="date" label="Purchased" defaultValue={item?.purchasedOn ?? ""} />
        {showPrice && <MoneyField name="purchaseCents" label="Purchase price" defaultValue={centsToInput(item?.purchaseCents)} disabled={!canSetPrice} />}
      </Row>
      <TextAreaField name="notes" label="Notes" defaultValue={item?.notes ?? ""} rows={2} />
      {upcoming && (
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted">Upcoming shoots</div>
          {upcoming.length === 0 ? (
            <p className="text-[13px] text-subtle">Not booked for any upcoming events.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {upcoming.map((u) => (
                <li key={u.id}>
                  <Link href={`/calendar?event=${u.id}`} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px] hover:bg-surface-2/60">
                    <span className="truncate">{u.title}{u.client ? <span className="text-muted"> · {u.client}</span> : null}</span>
                    <span className="shrink-0 text-xs text-subtle">{u.when}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </FormDialog>
  );
}
