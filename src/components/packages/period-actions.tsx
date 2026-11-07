"use client";
import { Lock, LockOpen, Pencil, Plus, RefreshCw } from "lucide-react";
import { ActionButton, FormDialog } from "@/components/form";
import { Row, TextAreaField, TextField } from "@/components/fields";
import { Button } from "@/components/ui/button";
import { closePeriod, createNextPeriod, reopenPeriod, syncPackagePeriods, updatePeriod } from "@/server/packages/actions";

export function ClosePeriodButton({ id, remaining, rolloverPreview }: { id: string; remaining: number; rolloverPreview: number }) {
  return (
    <ActionButton
      size="sm"
      variant="ghost"
      action={() => closePeriod(id)}
      confirm={`Close this period?${remaining ? ` ${remaining} video(s) are still undelivered.` : ""}${rolloverPreview ? ` ${rolloverPreview} will roll over to the next period.` : remaining ? " They will not roll over (per package rules)." : ""}`}
    >
      <Lock /> Close period
    </ActionButton>
  );
}

export function ReopenPeriodButton({ id }: { id: string }) {
  return (
    <ActionButton size="sm" variant="ghost" action={() => reopenPeriod(id)}>
      <LockOpen /> Reopen
    </ActionButton>
  );
}

export function EditPeriodDialog({ period }: { period: { id: string; videosIncluded: number; rolledOverIn: number; notes: string | null } }) {
  return (
    <FormDialog
      trigger={<Button variant="ghost" size="icon-sm" aria-label="Adjust period"><Pencil /></Button>}
      title="Adjust period"
      description="Use for one-off changes to this period only (e.g. a bonus video)."
      action={updatePeriod.bind(null, period.id)}
    >
      <Row>
        <TextField name="videosIncluded" type="number" min={0} label="Videos included" defaultValue={period.videosIncluded} />
        <TextField name="rolledOverIn" type="number" min={0} label="Rolled over from previous" defaultValue={period.rolledOverIn} />
      </Row>
      <TextAreaField name="notes" label="Notes" rows={2} defaultValue={period.notes ?? ""} />
    </FormDialog>
  );
}

export function NewPeriodDialog({ packageId, suggestedStart, suggestedEnd, videosIncluded, rolloverPreview }: { packageId: string; suggestedStart: string; suggestedEnd: string; videosIncluded: number; rolloverPreview: number }) {
  return (
    <FormDialog
      trigger={<Button size="sm"><Plus /> New period</Button>}
      title="Start next period"
      description="The previous period is closed automatically if it has ended."
      action={createNextPeriod.bind(null, packageId)}
      submitLabel="Create period"
    >
      <Row>
        <TextField name="startDate" type="date" label="Start" defaultValue={suggestedStart} />
        <TextField name="endDate" type="date" label="End" defaultValue={suggestedEnd} />
      </Row>
      <Row>
        <TextField name="videosIncluded" type="number" min={0} label="Videos included" defaultValue={videosIncluded} />
        <TextField name="rolledOverIn" type="number" min={0} label="Rolled over" defaultValue={rolloverPreview} hint="Calculated from the package rollover rule." />
      </Row>
    </FormDialog>
  );
}

export function SyncPeriodsButton({ packageId }: { packageId: string }) {
  return (
    <ActionButton size="sm" variant="ghost" action={() => syncPackagePeriods(packageId)}>
      <RefreshCw /> Sync periods
    </ActionButton>
  );
}
