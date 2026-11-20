"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Eye, FileSpreadsheet, Info, Pencil, Plus, RefreshCw, Unplug } from "lucide-react";
import type { SheetSourceKind } from "@prisma/client";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ActionButton, FormDialog } from "@/components/form";
import { CheckboxField, SelectField, TextAreaField, TextField } from "@/components/fields";
import { CopyButton } from "@/components/copy-button";
import { EmptyState } from "@/components/ui/misc";
import { timeAgo } from "@/lib/dates";
import type { Issue } from "@/lib/domain/sheets";
import { deleteSheetSource, runSheetSyncNow, saveSheetSource } from "@/server/sheets/actions";

export const SHEET_KIND: Record<SheetSourceKind, { label: string; help: string }> = {
  BUSINESS_ACCOUNT: {
    label: "Business account (invoices & expenses)",
    help: "Month tabs (e.g. “November 2026”) with an Invoice & Project table and a Monthly Business Expenses table, plus an “Editing Costs” tab. Summary, profit and tax tabs are skipped.",
  },
  CLIENT_VIDEO_LOG: {
    label: "Client video logbook",
    help: "One client's videos: Video # · Video Description · Status (Posted, Ready to post, In progress…). Each Video # becomes a video in Production.",
  },
  CLIENT_CONTENT_LIST: {
    label: "Client content list",
    help: "One client's list per month tab: Type · Title · Status (Confirmed, Not started…). Each titled row becomes a video in Production.",
  },
  EDITING_LOG: {
    label: "Video editing logbook",
    help: "Video · Editor · Price · Status · Currency. Adds the editor and editor cost to the video with the same title.",
  },
};

export type SheetSourceRow = {
  id: string;
  name: string;
  spreadsheetId: string;
  kind: SheetSourceKind;
  clientId: string | null;
  clientName: string | null;
  clientAliases: string | null;
  enabled: boolean;
  lastRunAt: Date | null;
  lastStatus: string | null;
  lastSummary: string | null;
  lastIssues: Issue[];
};

const STATUS_TONE = { ok: "success", warnings: "warning", error: "danger" } as const;

function Section({ title, description, children, action }: { title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card className="mb-5">
      <CardHeader title={title} description={description} action={action} />
      <CardBody className="flex flex-col gap-4 pt-2">{children}</CardBody>
    </Card>
  );
}

export function SheetsPanel({ sources, clients, serviceEmail, credentialsProblem }: { sources: SheetSourceRow[]; clients: { id: string; name: string }[]; serviceEmail: string | null; credentialsProblem: string | null }) {
  return (
    <>
      <Section
        title="Google Sheets"
        description="Your sheets stay the master copy. NOISE OS reads them about every 15 minutes (and whenever you press Sync now) and updates invoices, expenses and videos to match. It never writes to your sheets."
        action={<SourceDialog clients={clients} />}
      >
        <ConnectionBox serviceEmail={serviceEmail} problem={credentialsProblem} />
        {sources.length === 0 ? (
          <EmptyState icon={FileSpreadsheet} title="No sheets connected yet" description="Add your business account sheet and your client logbooks." />
        ) : (
          <ul className="-mx-4 divide-y divide-border">
            {sources.map((s) => (
              <SourceRow key={s.id} s={s} clients={clients} canRun={Boolean(serviceEmail)} />
            ))}
          </ul>
        )}
      </Section>
      <Section title="How syncing works">
        <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-muted">
          <li>Records that come from a sheet are updated to match it. Edit them in the sheet; changes made to them in the app are overwritten on the next sync.</li>
          <li>Invoices are matched by number (“19” and “SKV-0019” are the same invoice). The sheet&apos;s Amount Received decides the invoice&apos;s payment.</li>
          <li>Rows that can&apos;t be read (no invoice number, no date, no amount) are listed under the sheet instead of guessed.</li>
          <li>If a row is deleted from the sheet, its expense or video is removed too. Invoices are never deleted automatically.</li>
          <li>If many rows disappear at once, or a table can&apos;t be found, nothing is removed. That usually means a header or tab was renamed.</li>
          <li>Disconnecting a sheet keeps everything it created as normal records.</li>
        </ul>
      </Section>
    </>
  );
}

function ConnectionBox({ serviceEmail, problem }: { serviceEmail: string | null; problem: string | null }) {
  if (serviceEmail)
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-2/50 p-3 text-[13px]">
        <div className="min-w-0">
          <div className="font-medium">Connected to Google</div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            Share each sheet with <span className="font-mono text-fg">{serviceEmail}</span> as <b>Viewer</b> (Share → add this email → Viewer).
          </p>
        </div>
        <CopyButton text={serviceEmail} label="Copy email" size="sm" />
      </div>
    );
  return (
    <div className="rounded-lg border border-border bg-surface-2/50 p-3 text-xs leading-relaxed text-muted">
      <div className="mb-1 flex items-center gap-1.5 font-medium text-fg">
        <AlertTriangle className="size-3.5 text-warning" /> Google isn&apos;t connected yet
      </div>
      {problem && <p className="mb-2 text-danger">{problem}</p>}
      <ol className="list-decimal space-y-1 pl-4">
        <li>In Google Cloud Console, create a project, enable the <b>Google Sheets API</b>, and create a <b>service account</b>.</li>
        <li>Create a JSON key for the service account and download it.</li>
        <li>
          On the server (Railway → Variables), add <span className="font-mono text-fg">GOOGLE_SERVICE_ACCOUNT_JSON</span> with the whole content of that file, then redeploy.
        </li>
        <li>Share each sheet with the service account&apos;s email as Viewer. It will show here once connected.</li>
      </ol>
    </div>
  );
}

function SourceRow({ s, clients, canRun }: { s: SheetSourceRow; clients: { id: string; name: string }[]; canRun: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"preview" | "sync" | null>(null);
  const [result, setResult] = React.useState<{ dryRun: boolean; summary: string; issues: Issue[] } | null>(null);
  const [open, setOpen] = React.useState(false);

  async function run(dryRun: boolean) {
    setBusy(dryRun ? "preview" : "sync");
    const r = await runSheetSyncNow(s.id, dryRun);
    setBusy(null);
    if (r.ok && r.data) {
      setResult({ dryRun, summary: r.data.summary, issues: r.data.issues });
      setOpen(true);
      toast.success(r.message ?? "Done");
      router.refresh();
    } else if (!r.ok) toast.error(r.error);
  }

  const issues = result?.issues ?? s.lastIssues;
  const warns = issues.filter((i) => i.level === "warn").length;
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
            <a href={`https://docs.google.com/spreadsheets/d/${s.spreadsheetId}/edit`} target="_blank" rel="noreferrer" className="hover:underline">
              {s.name}
            </a>
            {!s.enabled && <Badge>Paused</Badge>}
            {s.lastStatus && <Badge tone={STATUS_TONE[s.lastStatus as keyof typeof STATUS_TONE] ?? "neutral"}>{s.lastStatus === "ok" ? "Synced" : s.lastStatus === "warnings" ? "Needs attention" : "Failed"}</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {SHEET_KIND[s.kind].label}
            {s.clientName ? ` · ${s.clientName}` : ""}
            {s.lastRunAt ? ` · last synced ${timeAgo(new Date(s.lastRunAt))}` : " · never synced"}
          </p>
          {(result?.summary ?? s.lastSummary) && (
            <p className="mt-1 text-xs text-fg">
              {result?.dryRun && <span className="font-medium">Preview (nothing saved): </span>}
              {result?.summary ?? s.lastSummary}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="ghost" disabled={!canRun || busy !== null} onClick={() => run(true)} title="See what would change without saving">
            <Eye /> {busy === "preview" ? "Checking…" : "Preview"}
          </Button>
          <Button size="sm" disabled={!canRun || busy !== null} onClick={() => run(false)}>
            <RefreshCw className={busy === "sync" ? "animate-spin" : undefined} /> {busy === "sync" ? "Syncing…" : "Sync now"}
          </Button>
          <SourceDialog source={s} clients={clients} />
          <ActionButton
            size="icon-sm"
            variant="ghost"
            aria-label="Disconnect"
            confirm={`Disconnect “${s.name}”? Records it created stay in the app as normal records.`}
            action={() => deleteSheetSource(s.id)}
          >
            <Unplug />
          </ActionButton>
        </div>
      </div>
      {issues.length > 0 && (
        <div className="mt-2">
          <button type="button" className="text-xs font-medium text-muted hover:text-fg" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide" : "Show"} {warns ? `${warns} to fix` : ""}
            {warns && issues.length > warns ? " and " : ""}
            {issues.length > warns ? `${issues.length - warns} note${issues.length - warns === 1 ? "" : "s"}` : ""}
          </button>
          {open && (
            <ul className="mt-2 space-y-1.5 rounded-lg border border-border bg-surface-2/40 p-3">
              {[...issues]
                .sort((a, b) => (a.level === b.level ? 0 : a.level === "warn" ? -1 : 1))
                .map((i, n) => (
                  <li key={n} className="flex gap-2 text-xs leading-relaxed">
                    {i.level === "warn" ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" /> : <Info className="mt-0.5 size-3.5 shrink-0 text-muted" />}
                    <span>
                      {i.tab && (
                        <span className="text-muted">
                          {i.tab}
                          {i.row ? `, row ${i.row}` : ""}:{" "}
                        </span>
                      )}
                      {i.message}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function SourceDialog({ source, clients }: { source?: SheetSourceRow; clients: { id: string; name: string }[] }) {
  const [kind, setKind] = React.useState<SheetSourceKind>(source?.kind ?? "BUSINESS_ACCOUNT");
  const needsClient = kind === "CLIENT_VIDEO_LOG" || kind === "CLIENT_CONTENT_LIST";
  return (
    <FormDialog
      title={source ? "Edit sheet" : "Connect a Google Sheet"}
      action={saveSheetSource}
      trigger={
        source ? (
          <Button variant="ghost" size="icon-sm" aria-label="Edit">
            <Pencil />
          </Button>
        ) : (
          <Button size="sm">
            <Plus /> Add sheet
          </Button>
        )
      }
    >
      {source && <input type="hidden" name="id" value={source.id} />}
      <TextField name="name" label="Name" defaultValue={source?.name} placeholder="Business account" autoFocus />
      <TextField
        name="link"
        label="Google Sheets link"
        defaultValue={source ? `https://docs.google.com/spreadsheets/d/${source.spreadsheetId}/edit` : ""}
        placeholder="https://docs.google.com/spreadsheets/d/…"
      />
      <SelectField
        name="kind"
        label="What's in it"
        value={kind}
        onChange={(e) => setKind(e.target.value as SheetSourceKind)}
        options={(Object.keys(SHEET_KIND) as SheetSourceKind[]).map((k) => ({ value: k, label: SHEET_KIND[k].label }))}
        hint={SHEET_KIND[kind].help}
      />
      {needsClient && (
        <SelectField name="clientId" label="Client" defaultValue={source?.clientId ?? ""} placeholder="Choose a client" options={clients.map((c) => ({ value: c.id, label: c.name }))} />
      )}
      {kind === "BUSINESS_ACCOUNT" && (
        <TextAreaField
          name="clientAliases"
          label="Client names (optional)"
          rows={3}
          defaultValue={source?.clientAliases ?? ""}
          placeholder={"Remax = Remax Marsascala\nYachthub = Yachthub Group"}
          hint="When the sheet calls a client something different from the app, one per line: name in sheet = name in app. Short forms like AUM are matched automatically."
        />
      )}
      <CheckboxField name="enabled" label="Sync automatically" defaultChecked={source?.enabled ?? true} />
    </FormDialog>
  );
}
