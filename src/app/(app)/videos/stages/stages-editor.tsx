"use client";
import * as React from "react";
import { ArrowDown, ArrowUp, Archive, Pencil, Plus } from "lucide-react";
import type { StageCategory } from "@prisma/client";
import { FormDialog, ActionButton } from "@/components/form";
import { TextField, SelectField, Row } from "@/components/fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABEL } from "@/lib/domain/packages";
import { STAGE_COLORS } from "@/lib/labels";
import { createStage, updateStage, moveStage, archiveStage } from "@/server/videos/stage-actions";
import { StageDot } from "@/components/videos/video-bits";

type S = { id: string; name: string; category: StageCategory; color: string; count: number };

const categoryOptions = Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }));
const colorOptions = Object.keys(STAGE_COLORS).map((c) => ({ value: c, label: c[0]!.toUpperCase() + c.slice(1) }));

function StageFields({ s }: { s?: S }) {
  return (
    <>
      <TextField name="name" label="Name" defaultValue={s?.name} autoFocus />
      <Row>
        <SelectField name="category" label="Category" options={categoryOptions} defaultValue={s?.category ?? "EDITING"} hint="Drives package progress" />
        <SelectField name="color" label="Colour" options={colorOptions} defaultValue={s?.color ?? "zinc"} />
      </Row>
    </>
  );
}

export function StagesEditor({ stages }: { stages: S[] }) {
  return (
    <Card>
      <ul className="divide-y divide-border">
        {stages.map((s, i) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
            <StageDot color={s.color} />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{s.name}</span>
            <Badge>{CATEGORY_LABEL[s.category]}</Badge>
            <span className="tabular hidden w-16 text-right text-xs text-subtle sm:inline">{s.count} video{s.count === 1 ? "" : "s"}</span>
            <div className="flex items-center">
              <ActionButton size="icon-sm" variant="ghost" aria-label={`Move ${s.name} up`} disabled={i === 0} action={() => moveStage(s.id, -1)} successMessage={false}><ArrowUp /></ActionButton>
              <ActionButton size="icon-sm" variant="ghost" aria-label={`Move ${s.name} down`} disabled={i === stages.length - 1} action={() => moveStage(s.id, 1)} successMessage={false}><ArrowDown /></ActionButton>
              <FormDialog title={`Edit “${s.name}”`} action={updateStage.bind(null, s.id)} trigger={<Button size="icon-sm" variant="ghost" aria-label={`Edit ${s.name}`}><Pencil /></Button>}>
                <StageFields s={s} />
              </FormDialog>
              <ActionButton
                size="icon-sm"
                variant="ghost"
                aria-label={`Archive ${s.name}`}
                title={s.count ? "Move its videos out first" : "Archive stage"}
                disabled={s.count > 0}
                confirm={`Archive the “${s.name}” stage?`}
                action={() => archiveStage(s.id)}
                successMessage="Stage archived"
              >
                <Archive />
              </ActionButton>
            </div>
          </li>
        ))}
      </ul>
      <div className="border-t border-border px-4 py-3">
        <FormDialog title="Add stage" action={createStage} submitLabel="Add stage" trigger={<Button size="sm"><Plus /> Add stage</Button>}>
          <StageFields />
        </FormDialog>
      </div>
    </Card>
  );
}
