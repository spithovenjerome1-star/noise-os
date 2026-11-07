"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ActionButton, FormDialog, type ActionResult } from "@/components/form";
import { CheckboxField, MoneyField, Row, SelectField, TextAreaField, TextField } from "@/components/fields";
import { PACKAGE_TYPE_LABEL, ROLLOVER_LABEL } from "@/lib/domain/packages";
import { options } from "@/lib/labels";
import { createPackage, deletePackage, updatePackage } from "@/server/packages/actions";

export type PackageDefaults = {
  id: string;
  clientId: string;
  name: string;
  type: string;
  videosIncluded: number | null;
  priceCents: number;
  hourlyRateCents: number | null;
  startDate: string;
  endDate: string | null;
  active: boolean;
  autoRenew: boolean;
  rolloverPolicy: string;
  rolloverCap: number | null;
  turnaroundDays: number | null;
  barterTerms: string | null;
  notes: string | null;
};

const money = (c: number | null | undefined) => (c != null ? (c / 100).toFixed(2) : "");

export function PackageFormDialog({
  pkg,
  clients,
  trigger,
  openOnNew,
  today,
  canFinance,
}: {
  pkg?: PackageDefaults;
  clients: { value: string; label: string }[];
  trigger?: React.ReactNode;
  openOnNew?: boolean;
  today: string;
  canFinance: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = React.useState(Boolean(openOnNew && sp.get("new") === "1"));
  const [type, setType] = React.useState(pkg?.type ?? "MONTHLY_RETAINER");
  const [rollover, setRollover] = React.useState(pkg?.rolloverPolicy ?? "NONE");
  const presetClient = pkg?.clientId ?? sp.get("client") ?? "";
  const recurring = type === "MONTHLY_RETAINER";

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o && sp.get("new")) {
      const next = new URLSearchParams(sp.toString());
      next.delete("new");
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
    }
  };

  return (
    <FormDialog
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={pkg ? `Edit ${pkg.name}` : "New package"}
      description={pkg ? "Changing videos included updates open periods only — closed periods stay as history." : "Packages track how many videos a client is owed per period."}
      submitLabel={pkg ? "Save changes" : "Create package"}
      action={(pkg ? updatePackage.bind(null, pkg.id) : createPackage) as (fd: FormData) => Promise<ActionResult<{ id?: string }>>}
      onSuccess={(d) => {
        const id = (d as { id?: string } | undefined)?.id;
        if (!pkg && id) router.push(`/packages/${id}`);
      }}
      danger={
        pkg ? (
          <ActionButton
            variant="danger-ghost"
            size="sm"
            confirm="Delete this package? Only possible if no videos or invoices are linked."
            action={() => deletePackage(pkg.id)}
            onSuccess={() => router.push("/packages")}
          >
            <Trash2 /> Delete
          </ActionButton>
        ) : undefined
      }
    >
      <Row>
        <SelectField name="clientId" label="Client *" options={clients} placeholder="Choose a client" defaultValue={presetClient} />
        <TextField name="name" label="Package name *" defaultValue={pkg?.name} placeholder="e.g. Social Pro — 10 videos" />
      </Row>
      <Row>
        <SelectField name="type" label="Type" options={options(PACKAGE_TYPE_LABEL)} value={type} onChange={(e) => setType(e.target.value)} />
        <TextField
          name="videosIncluded"
          type="number"
          min={0}
          label={recurring ? "Videos per month" : "Videos included"}
          defaultValue={pkg?.videosIncluded ?? ""}
          hint={type === "HOURLY" ? "Optional for hourly work" : undefined}
        />
      </Row>
      {canFinance ? (
        <Row>
          <MoneyField name="priceCents" label={recurring ? "Monthly price (excl. VAT)" : type === "BARTER" ? "Equivalent value" : "Price (excl. VAT)"} defaultValue={money(pkg?.priceCents)} />
          {type === "HOURLY" ? <MoneyField name="hourlyRateCents" label="Hourly rate *" defaultValue={money(pkg?.hourlyRateCents)} /> : <div className="hidden sm:block" />}
        </Row>
      ) : (
        <>
          <input type="hidden" name="priceCents" value={money(pkg?.priceCents)} />
          <input type="hidden" name="hourlyRateCents" value={money(pkg?.hourlyRateCents)} />
        </>
      )}
      {type === "BARTER" && <TextAreaField name="barterTerms" label="Barter terms *" rows={2} defaultValue={pkg?.barterTerms ?? ""} placeholder="What do we receive in exchange?" />}
      <Row cols={3}>
        <TextField name="startDate" type="date" label="Start date *" defaultValue={pkg?.startDate ?? today} hint={recurring ? "Monthly periods start on this day." : undefined} />
        <TextField name="endDate" type="date" label="End date" defaultValue={pkg?.endDate ?? ""} hint={recurring ? "Leave empty for ongoing." : "Leave empty if open-ended."} />
        <TextField name="turnaroundDays" type="number" min={0} label="Turnaround (days)" defaultValue={pkg?.turnaroundDays ?? ""} hint="Overrides client/default." />
      </Row>
      {recurring && (
        <Row>
          <SelectField name="rolloverPolicy" label="Unused videos" options={options(ROLLOVER_LABEL)} value={rollover} onChange={(e) => setRollover(e.target.value)} />
          {rollover === "ROLLOVER_CAPPED" ? <TextField name="rolloverCap" type="number" min={0} label="Max videos to roll over *" defaultValue={pkg?.rolloverCap ?? ""} /> : <div className="hidden sm:block" />}
        </Row>
      )}
      <div className="flex flex-col gap-2.5">
        <CheckboxField name="active" label="Active" defaultChecked={pkg ? pkg.active : true} hint="Inactive packages keep their history but stop generating periods." />
        {recurring && <CheckboxField name="autoRenew" label="Create a new period automatically each month" defaultChecked={pkg ? pkg.autoRenew : true} />}
      </div>
      <TextAreaField name="notes" label="Notes" rows={2} defaultValue={pkg?.notes ?? ""} />
    </FormDialog>
  );
}
