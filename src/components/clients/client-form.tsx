"use client";
import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { FormDialog } from "@/components/form";
import { MoneyField, Row, SelectField, TextAreaField, TextField } from "@/components/fields";
import { CLIENT_STATUS, options } from "@/lib/labels";
import { createClient, updateClient } from "@/server/clients/actions";

export type ClientDefaults = {
  id: string;
  name: string;
  companyName: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  industry: string | null;
  status: string;
  valueCents: number | null;
  packageLabel: string | null;
  startedAt: string | null;
  paymentTermsDays: number | null;
  turnaroundDays: number | null;
  notes: string | null;
  driveUrl: string | null;
  brandColors: string | null;
  brandFonts: string | null;
  brandGuidelines: string | null;
  vatNumber: string | null;
  billingAddress: string | null;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-[11px] font-medium uppercase tracking-wide text-subtle">{title}</legend>
      {children}
    </fieldset>
  );
}

export function ClientFormDialog({
  client,
  trigger,
  canFinance,
  openOnNew,
}: {
  client?: ClientDefaults;
  trigger?: React.ReactNode;
  canFinance: boolean;
  openOnNew?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = React.useState(Boolean(openOnNew && sp.get("new") === "1"));
  const c = client;
  const action = c ? updateClient.bind(null, c.id) : createClient;

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o && sp.get("new")) router.replace(pathname, { scroll: false });
  };

  return (
    <FormDialog
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={c ? `Edit ${c.name}` : "Add client"}
      description={c ? undefined : "Only the name is required — fill in the rest whenever you have it."}
      submitLabel={c ? "Save changes" : "Add client"}
      action={action}
      onSuccess={(d) => {
        const id = (d as { id?: string } | undefined)?.id;
        if (!c && id) router.push(`/clients/${id}`);
      }}
    >
      <Section title="Basics">
        <Row>
          <TextField name="name" label="Client name *" defaultValue={c?.name} autoFocus placeholder="e.g. Bistro Boca" />
          <TextField name="companyName" label="Company / legal name" defaultValue={c?.companyName ?? ""} />
        </Row>
        <Row cols={3}>
          <SelectField name="status" label="Status" options={options(CLIENT_STATUS)} defaultValue={c?.status ?? "LEAD"} />
          <TextField name="industry" label="Industry" defaultValue={c?.industry ?? ""} placeholder="Restaurant, automotive…" />
          <TextField name="startedAt" type="date" label="Collaboration started" defaultValue={c?.startedAt ?? ""} />
        </Row>
      </Section>
      <Section title="Contact & socials">
        <Row>
          <TextField name="contactPerson" label="Contact person" defaultValue={c?.contactPerson ?? ""} />
          <TextField name="email" type="email" label="Email" defaultValue={c?.email ?? ""} />
        </Row>
        <Row>
          <TextField name="phone" type="tel" label="Phone" defaultValue={c?.phone ?? ""} placeholder="+356 …" />
          <TextField name="whatsapp" type="tel" label="WhatsApp" defaultValue={c?.whatsapp ?? ""} placeholder="+356 …" />
        </Row>
        <Row>
          <TextField name="website" label="Website" defaultValue={c?.website ?? ""} placeholder="example.com" />
          <TextField name="instagram" label="Instagram" defaultValue={c?.instagram ?? ""} placeholder="@handle" />
        </Row>
        <Row>
          <TextField name="facebook" label="Facebook" defaultValue={c?.facebook ?? ""} />
          <TextField name="tiktok" label="TikTok" defaultValue={c?.tiktok ?? ""} placeholder="@handle" />
        </Row>
      </Section>
      <Section title="Commercial">
        <Row>
          <TextField name="packageLabel" label="Package type (label)" defaultValue={c?.packageLabel ?? ""} placeholder="e.g. 10 videos / month" hint="Free text. Track actual quotas under Packages." />
          <TextField name="turnaroundDays" type="number" min={0} label="Delivery turnaround (days)" defaultValue={c?.turnaroundDays ?? ""} hint="Leave empty to use the default (7 days)." />
        </Row>
        {canFinance && (
          <>
            <Row>
              <MoneyField name="valueCents" label="Monthly retainer / project value" defaultValue={c?.valueCents != null ? (c.valueCents / 100).toFixed(2) : ""} />
              <TextField name="paymentTermsDays" type="number" min={0} label="Payment terms (days)" defaultValue={c?.paymentTermsDays ?? ""} hint="Leave empty for the default." />
            </Row>
            <Row>
              <TextField name="vatNumber" label="Client VAT number" defaultValue={c?.vatNumber ?? ""} placeholder="MT…" />
              <TextAreaField name="billingAddress" label="Billing address" rows={2} className="[&_textarea]:min-h-8" defaultValue={c?.billingAddress ?? ""} />
            </Row>
          </>
        )}
      </Section>
      <Section title="Brand">
        <Row>
          <TextField name="brandColors" label="Brand colours" defaultValue={c?.brandColors ?? ""} placeholder="#111111, #FF4D2E" />
          <TextField name="brandFonts" label="Fonts" defaultValue={c?.brandFonts ?? ""} placeholder="Helvetica Neue, Inter" />
        </Row>
        <TextAreaField name="brandGuidelines" label="Creative guidelines" rows={3} defaultValue={c?.brandGuidelines ?? ""} placeholder="Tone of voice, do's and don'ts, music style…" />
      </Section>
      <Section title="Links & notes">
        <TextField name="driveUrl" label="Google Drive folder" defaultValue={c?.driveUrl ?? ""} placeholder="https://drive.google.com/…" />
        <TextAreaField name="notes" label="Internal notes" rows={3} defaultValue={c?.notes ?? ""} hint="Never shown to the client." />
      </Section>
    </FormDialog>
  );
}
