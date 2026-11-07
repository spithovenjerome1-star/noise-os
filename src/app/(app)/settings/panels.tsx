"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Lock, Plus, Pencil, Trash2, KeyRound, ArrowRight, Database, ShieldCheck } from "lucide-react";
import type { Role, Settings, VatRate } from "@prisma/client";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionButton, ActionForm, FormDialog, SubmitButton } from "@/components/form";
import { CheckboxField, Row, SelectField, TextAreaField, TextField } from "@/components/fields";
import { Avatar } from "@/components/ui/misc";
import { formatRateBp } from "@/lib/money";
import { formatInvoiceNumber } from "@/lib/domain/invoices";
import { ROLE, options } from "@/lib/labels";

import {
  updateBusinessSettings, updateProductionSettings, updateFinanceSettings, saveVatRate, archiveVatRate, createMember, updateMember,
  resetMemberPassword, changeOwnPassword, removeDemoData,
} from "@/server/settings/actions";
import { setRuleEnabled } from "@/server/automations/actions";

function Section({ title, description, children, footer }: { title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <Card className="mb-5">
      <CardHeader title={title} description={description} />
      <CardBody className="flex flex-col gap-4 pt-2">{children}</CardBody>
      {footer && <div className="flex justify-end border-t border-border px-4 py-3">{footer}</div>}
    </Card>
  );
}

export function BusinessForm({ s }: { s: Settings }) {
  const [prefix, setPrefix] = React.useState(s.invoicePrefix);
  const [next, setNext] = React.useState(String(s.nextInvoiceNumber));
  const [pad, setPad] = React.useState(String(s.invoicePadding));
  const preview = formatInvoiceNumber(prefix, Number(next) || 1, Math.min(8, Math.max(1, Number(pad) || 1)));
  return (
    <ActionForm action={updateBusinessSettings}>
      <Section title="Business details" description="Shown on invoices and your public services page.">
        <Row>
          <TextField name="businessName" label="Business name" defaultValue={s.businessName} />
          <TextField name="legalName" label="Legal name" defaultValue={s.legalName ?? ""} />
        </Row>
        <Row>
          <TextField name="vatNumber" label="VAT number" defaultValue={s.vatNumber ?? ""} placeholder="MT12345678" />
          <TextField name="iban" label="IBAN" defaultValue={s.iban ?? ""} />
        </Row>
        <Row>
          <TextField name="email" type="email" label="Email" defaultValue={s.email ?? ""} />
          <TextField name="phone" label="Phone" defaultValue={s.phone ?? ""} />
        </Row>
        <TextAreaField name="address" label="Address" defaultValue={s.address ?? ""} rows={2} />
      </Section>
      <Section title="Invoices" description="Numbers are issued sequentially and must stay unique." footer={<SubmitButton>Save changes</SubmitButton>}>
        <Row cols={3}>
          <TextField name="invoicePrefix" label="Prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
          <TextField name="nextInvoiceNumber" label="Next number" inputMode="numeric" value={next} onChange={(e) => setNext(e.target.value)} />
          <TextField name="invoicePadding" label="Digits" inputMode="numeric" value={pad} onChange={(e) => setPad(e.target.value)} />
        </Row>
        <p className="text-xs text-muted">
          Next invoice: <span className="font-mono text-fg">{preview}</span>
        </p>
        <Row>
          <TextField name="defaultPaymentTerms" label="Default payment terms (days)" inputMode="numeric" defaultValue={s.defaultPaymentTerms} />
        </Row>
        <TextAreaField name="invoiceFooter" label="Invoice footer" defaultValue={s.invoiceFooter ?? ""} rows={2} placeholder="Payment details, thank-you note…" />
      </Section>
    </ActionForm>
  );
}

export function ProductionForm({ s, stageCount }: { s: Settings; stageCount: number }) {
  return (
    <>
      <ActionForm action={updateProductionSettings}>
        <Section title="Deadlines & alerts" description="Clients and packages can override the turnaround." footer={<SubmitButton>Save changes</SubmitButton>}>
          <Row>
            <TextField name="defaultTurnaroundDays" label="Delivery after filming (days)" inputMode="numeric" defaultValue={s.defaultTurnaroundDays} hint="Deadline = filming date + this many calendar days." />
            <TextField name="deadlineWarningDays" label="Warn before deadline (days)" inputMode="numeric" defaultValue={s.deadlineWarningDays} />
          </Row>
          <Row>
            <TextField name="approvalStaleDays" label="Flag approvals waiting longer than (days)" inputMode="numeric" defaultValue={s.approvalStaleDays} />
            <TextField name="inactiveClientDays" label="Flag inactive clients after (days)" inputMode="numeric" defaultValue={s.inactiveClientDays} />
          </Row>
        </Section>
      </ActionForm>
      <Card>
        <Link href="/videos/stages" className="flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-surface-2/60">
          <div>
            <div className="text-[13px] font-medium">Pipeline stages</div>
            <div className="text-xs text-muted">{stageCount} stages · rename, reorder or add stages</div>
          </div>
          <ArrowRight className="size-4 text-subtle" />
        </Link>
      </Card>
    </>
  );
}

export function FinanceSettings({ estimatedTaxRateBp, rates }: { estimatedTaxRateBp: number; rates: VatRate[] }) {
  return (
    <>
      <Section title="VAT rates" description="Pick a rate per invoice line. Confirm the right treatment for each client with your accountant.">
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH className="text-right">Rate</TH>
                <TH className="hidden sm:table-cell">Note</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {rates.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <span className="font-medium">{r.name}</span> {r.isDefault && <Badge tone="info" className="ml-1.5">Default</Badge>}
                  </TD>
                  <TD className="tabular text-right">{formatRateBp(r.rateBp)}</TD>
                  <TD className="hidden max-w-xs truncate text-muted sm:table-cell">{r.note}</TD>
                  <TD className="w-px whitespace-nowrap text-right">
                    <VatDialog rate={r} />
                    {!r.isDefault && (
                      <ActionButton action={() => archiveVatRate(r.id)} variant="ghost" size="icon-sm" confirm={`Remove “${r.name}”? Existing invoices keep their rates.`} aria-label="Remove">
                        <Trash2 />
                      </ActionButton>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
        <div>
          <VatDialog />
        </div>
      </Section>
      <ActionForm action={updateFinanceSettings}>
        <Section title="Tax estimate" description="Used only for an indicative tax figure on analytics. Not accounting advice." footer={<SubmitButton>Save</SubmitButton>}>
          <Row>
            <TextField name="estimatedTaxRateBp" label="Estimated tax rate (%)" inputMode="decimal" defaultValue={estimatedTaxRateBp / 100} />
          </Row>
        </Section>
      </ActionForm>
    </>
  );
}

function VatDialog({ rate }: { rate?: VatRate }) {
  return (
    <FormDialog
      title={rate ? "Edit VAT rate" : "Add VAT rate"}
      action={saveVatRate}
      trigger={
        rate ? (
          <Button variant="ghost" size="icon-sm" aria-label="Edit">
            <Pencil />
          </Button>
        ) : (
          <Button size="sm">
            <Plus /> Add rate
          </Button>
        )
      }
    >
      {rate && <input type="hidden" name="id" value={rate.id} />}
      <Row>
        <TextField name="name" label="Name" defaultValue={rate?.name} placeholder="Standard 18%" autoFocus />
        <TextField name="rateBp" label="Rate (%)" inputMode="decimal" defaultValue={rate ? rate.rateBp / 100 : ""} />
      </Row>
      <TextField name="note" label="Note" defaultValue={rate?.note ?? ""} placeholder="When to use this rate" />
      <CheckboxField name="isDefault" label="Default for new invoice lines" defaultChecked={rate?.isDefault} />
    </FormDialog>
  );
}

type TeamUser = { id: string; name: string; email: string; role: Role; active: boolean; canLogin: boolean; hasPassword: boolean; createdAt: Date };

export function TeamPanel({ users, meId }: { users: TeamUser[]; meId: string }) {
  return (
    <Section title="Team" description="Owners and admins see finances. Team members only see production work (clients, videos, scripts, tasks, calendar).">
      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <THead>
            <TR>
              <TH>Person</TH>
              <TH>Role</TH>
              <TH className="hidden sm:table-cell">Access</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {users.map((u) => (
              <TR key={u.id} className={!u.active ? "opacity-60" : undefined}>
                <TD>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={u.name} />
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {u.name} {u.id === meId && <span className="text-xs font-normal text-subtle">(you)</span>}
                      </div>
                      <div className="truncate text-xs text-muted">{u.email}</div>
                    </div>
                  </div>
                </TD>
                <TD>
                  <Badge tone={u.role === "OWNER" ? "accent" : u.role === "ADMIN" ? "info" : "neutral"}>{ROLE[u.role]}</Badge>
                </TD>
                <TD className="hidden text-muted sm:table-cell">{!u.active ? "Deactivated" : u.canLogin ? "Can sign in" : "No sign-in (assignable only)"}</TD>
                <TD className="w-px whitespace-nowrap text-right">
                  <MemberDialog user={u} />
                  <PasswordDialog user={u} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
      <div>
        <AddMemberDialog />
      </div>
    </Section>
  );
}

function AddMemberDialog() {
  const [canLogin, setCanLogin] = React.useState(true);
  return (
    <FormDialog
      title="Add team member"
      description="Editors and crew can be assigned to videos and tasks. Give them sign-in only if they need it."
      action={createMember}
      submitLabel="Add member"
      trigger={
        <Button size="sm">
          <Plus /> Add member
        </Button>
      }
    >
      <Row>
        <TextField name="name" label="Name" autoFocus />
        <TextField name="email" type="email" label="Email" />
      </Row>
      <SelectField name="role" label="Role" defaultValue="MEMBER" options={options(ROLE)} />
      <label className="flex items-center gap-2.5 text-[13px]">
        <input type="checkbox" name="canLogin" checked={canLogin} onChange={(e) => setCanLogin(e.target.checked)} className="size-4 accent-[var(--fg)]" />
        Can sign in to NOISE OS
      </label>
      {canLogin && <TextField name="password" type="text" label="Temporary password" hint="At least 10 characters. Share it privately; they can change it under My account." autoComplete="off" />}
    </FormDialog>
  );
}

function MemberDialog({ user }: { user: TeamUser }) {
  return (
    <FormDialog
      title={`Edit ${user.name}`}
      action={updateMember}
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label="Edit">
          <Pencil />
        </Button>
      }
    >
      <input type="hidden" name="id" value={user.id} />
      <TextField name="name" label="Name" defaultValue={user.name} />
      <SelectField name="role" label="Role" defaultValue={user.role} options={options(ROLE)} />
      <CheckboxField name="canLogin" label="Can sign in" defaultChecked={user.canLogin} hint={!user.hasPassword ? "Set a password first using Reset password." : undefined} />
      <CheckboxField name="active" label="Active" defaultChecked={user.active} hint="Deactivated people keep their history but can't sign in or be assigned." />
    </FormDialog>
  );
}

function PasswordDialog({ user }: { user: TeamUser }) {
  return (
    <FormDialog
      title={`Reset password for ${user.name}`}
      description="Signs them out everywhere. Share the new password privately."
      action={resetMemberPassword}
      submitLabel="Reset password"
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label="Reset password">
          <KeyRound />
        </Button>
      }
    >
      <input type="hidden" name="id" value={user.id} />
      <TextField name="password" type="text" label="New password" autoComplete="off" hint="At least 10 characters." />
    </FormDialog>
  );
}

export function AutomationsPanel({ rules, externalCommsEnabled }: { rules: { key: string; title: string; description: string; enabled: boolean }[]; externalCommsEnabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  return (
    <>
      <Section title="Automation rules" description="Rules run automatically about every 10 minutes while you use the app, and on a schedule in production. Every run is logged in your Inbox.">
        <ul className="-mx-4 divide-y divide-border">
          {rules.map((r) => (
            <li key={r.key} className="flex items-start justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <div className="text-[13px] font-medium">{r.title}</div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{r.description}</p>
              </div>
              <Switch
                checked={r.enabled}
                disabled={busy === r.key}
                aria-label={`${r.enabled ? "Disable" : "Enable"} ${r.title}`}
                onCheckedChange={async (v) => {
                  setBusy(r.key);
                  const res = await setRuleEnabled(r.key, v);
                  setBusy(null);
                  if (res.ok) {
                    toast.success(res.message ?? "Saved");
                    router.refresh();
                  } else toast.error(res.error);
                }}
              />
            </li>
          ))}
        </ul>
      </Section>
      <Section title="External communication" description="Safety switch for emails, WhatsApp messages and payment reminders.">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-2/50 p-3">
          <Lock className="mt-0.5 size-4 shrink-0 text-muted" />
          <div className="text-[13px]">
            <div className="font-medium">{externalCommsEnabled ? "Enabled" : "Off"} — nothing is sent automatically</div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              NOISE OS never contacts clients on its own. Automations only create items in your Inbox. Messages to clients are always copied and sent by you
              (for example with “Copy for WhatsApp”). Automatic sending isn&apos;t built yet; if it is added, it will need this switch and explicit setup.
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}

export function DataPanel({ canExport, exports, demoCount }: { canExport: boolean; exports: { key: string; label: string }[]; demoCount: number }) {
  return (
    <>
      {canExport && (
        <Section title="Backup" description="A complete JSON export of your records (no passwords or session data). Uploaded files live in the storage folder and need their own backup.">
          <div>
            <Button asChild variant="primary" size="sm">
              <a href="/api/backup">
                <Download /> Download full backup
              </a>
            </Button>
          </div>
          <div className="rounded-lg border border-border bg-surface-2/50 p-3 text-xs leading-relaxed text-muted">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-fg">
              <Database className="size-3.5" /> Database backups
            </div>
            For a restorable copy of the whole database, run on the server:
            <pre className="mt-2 overflow-x-auto rounded-md bg-surface px-2.5 py-2 font-mono text-[11px] text-fg">pg_dump --format=custom --file=noise-os-$(date +%F).dump &quot;$DATABASE_URL&quot;</pre>
            Restore with <span className="font-mono">pg_restore --clean --dbname &quot;$DATABASE_URL&quot; file.dump</span>. Managed hosts (e.g. Supabase) also take daily backups.
          </div>
        </Section>
      )}
      {canExport && (
        <Section title="CSV exports" description="Spreadsheet-friendly files. Amounts in EUR, dates as YYYY-MM-DD.">
          <div className="flex flex-wrap gap-2">
            {exports.map((e) => (
              <Button key={e.key} asChild size="sm">
                <a href={`/api/backup/csv/${e.key}`}>
                  <Download /> {e.label}
                </a>
              </Button>
            ))}
          </div>
        </Section>
      )}
      <Section title="Demo data" description="Records created as demo data are clearly marked and can be removed in one go. Your real records are never touched.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[13px] text-muted">{demoCount ? `${demoCount} demo records found.` : "No demo data in your workspace."}</span>
          <ActionButton
            action={removeDemoData}
            variant="danger-ghost"
            size="sm"
            disabled={!demoCount}
            confirm="Remove all demo records (clients, videos, invoices, expenses, tasks and events marked as demo)? This can't be undone."
          >
            <Trash2 /> Remove demo data
          </ActionButton>
        </div>
      </Section>
    </>
  );
}

export function AccountForm({ name, email }: { name: string; email: string }) {
  return (
    <>
      <Section title="Profile">
        <div className="flex items-center gap-3">
          <Avatar name={name} className="size-9 text-xs" />
          <div>
            <div className="text-[13px] font-medium">{name}</div>
            <div className="text-xs text-muted">{email}</div>
          </div>
        </div>
      </Section>
      <ActionForm action={changeOwnPassword} resetOnSuccess>
        <Section
          title="Change password"
          description="Other devices will be signed out."
          footer={
            <SubmitButton>
              <ShieldCheck /> Change password
            </SubmitButton>
          }
        >
          <TextField name="current" type="password" label="Current password" autoComplete="current-password" />
          <Row>
            <TextField name="next" type="password" label="New password" autoComplete="new-password" hint="At least 10 characters." />
            <TextField name="confirm" type="password" label="Confirm new password" autoComplete="new-password" />
          </Row>
        </Section>
      </ActionForm>
    </>
  );
}

