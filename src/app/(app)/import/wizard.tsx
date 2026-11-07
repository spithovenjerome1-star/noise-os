"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { toast } from "sonner";
import { FileUp, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle, Copy, Users, Receipt, Wallet, Package, CheckSquare, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { IMPORT_FIELDS, ENTITY_LABEL, autoMap, type ImportEntity } from "@/lib/domain/import";
import { formatMoney } from "@/lib/money";
import { previewImport, commitImport } from "@/server/import/actions";

type Analysis = {
  index: number;
  values: Record<string, string | number | boolean | null>;
  errors: string[];
  warnings: string[];
  duplicate: "existing" | "file" | null;
  blocked: boolean;
};

const ENTITY_ICON: Record<ImportEntity, React.ComponentType<{ className?: string }>> = { clients: Users, invoices: Receipt, expenses: Wallet, packages: Package, tasks: CheckSquare };
const ENTITY_HINT: Record<ImportEntity, string> = {
  clients: "Import these first — other imports link to clients by name.",
  invoices: "One row per invoice. Payments are recorded only when an amount paid and date are given.",
  expenses: "Gross amounts as paid. VAT and business-use % are optional.",
  packages: "Retainers, bundles and one-off packages per client.",
  tasks: "To-dos with optional client, due date and priority.",
};
const STEPS = ["Upload", "Map columns", "Review", "Done"];

export function ImportWizard() {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [entity, setEntity] = React.useState<ImportEntity>("clients");
  const [fileName, setFileName] = React.useState("");
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = React.useState<Record<string, string | null>>({});
  const [analysis, setAnalysis] = React.useState<Analysis[] | null>(null);
  const [decisions, setDecisions] = React.useState<("create" | "skip")[]>([]);
  const [result, setResult] = React.useState<{ created: number; skipped: number; failed: number; logId: string } | null>(null);
  const [pending, start] = React.useTransition();
  const [drag, setDrag] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep(0);
    setFileName("");
    setHeaders([]);
    setRows([]);
    setAnalysis(null);
    setResult(null);
  };

  const onFile = (f: File) => {
    if (f.size > 10 * 1024 * 1024) return toast.error("That file is larger than 10 MB");
    Papa.parse<Record<string, string>>(f, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const hs = (res.meta.fields ?? []).filter(Boolean);
        if (!hs.length || !res.data.length) return toast.error("No rows found. Make sure the first row has column names.");
        setFileName(f.name);
        setHeaders(hs);
        setRows(res.data.map((r) => Object.fromEntries(hs.map((h) => [h, (r[h] ?? "").toString()]))));
        setMapping(autoMap(entity, hs));
        setStep(1);
      },
      error: (err) => toast.error(`Couldn't read the file: ${err.message}`),
    });
  };

  const fields = IMPORT_FIELDS[entity];
  const missingRequired = fields.filter((f) => f.required && !mapping[f.key]);

  const runPreview = () =>
    start(async () => {
      const r = await previewImport({ entity, mapping, rows });
      if (!r.ok) return void toast.error(r.error);
      const a = r.data!.rows as Analysis[];
      setAnalysis(a);
      setDecisions(a.map((x) => (x.errors.length || x.duplicate || x.blocked ? "skip" : "create")));
      setStep(2);
    });

  const runCommit = () =>
    start(async () => {
      const r = await commitImport({ entity, mapping, rows, fileName, decisions });
      if (!r.ok) return void toast.error(r.error);
      setResult(r.data!);
      setStep(3);
      toast.success(r.message ?? "Imported");
      router.refresh();
    });

  const counts = analysis
    ? {
        ok: analysis.filter((a) => !a.errors.length && !a.duplicate).length,
        errors: analysis.filter((a) => a.errors.length).length,
        dups: analysis.filter((a) => a.duplicate && !a.errors.length).length,
        toCreate: decisions.filter((d, i) => d === "create" && !analysis[i]!.errors.length && !analysis[i]!.blocked).length,
      }
    : null;

  const fmt = (key: string, v: unknown) => {
    if (v === null || v === undefined || v === "") return <span className="text-subtle">—</span>;
    const f = fields.find((x) => x.key === key);
    if (f?.type === "money") return <span className="tabular">{formatMoney(v as number)}</span>;
    if (f?.type === "percent") return `${(v as number) / 100}%`;
    return String(v);
  };
  const previewCols = fields.filter((f) => mapping[f.key]).slice(0, 6);

  return (
    <Card className="overflow-hidden">
      <ol className="flex border-b border-border">
        {STEPS.map((s, i) => (
          <li key={s} className={cn("flex flex-1 items-center gap-2 px-4 py-3 text-xs", i === step ? "font-medium text-fg" : "text-subtle")}>
            <span className={cn("tabular flex size-5 items-center justify-center rounded-full border text-[10px]", i < step ? "border-fg bg-fg text-bg" : i === step ? "border-fg" : "border-border")}>{i + 1}</span>
            <span className="hidden sm:inline">{s}</span>
          </li>
        ))}
      </ol>

      <div className="p-4 sm:p-5">
        {step === 0 && (
          <div className="flex flex-col gap-5">
            <div>
              <div className="mb-2 text-xs font-medium text-muted">What are you importing?</div>
              <div className="grid gap-2 sm:grid-cols-5">
                {(Object.keys(ENTITY_LABEL) as ImportEntity[]).map((e) => {
                  const Icon = ENTITY_ICON[e];
                  return (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setEntity(e)}
                      className={cn("flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[13px] transition-colors sm:flex-col sm:items-start", entity === e ? "border-fg bg-surface-2" : "border-border hover:bg-surface-2/60")}
                    >
                      <Icon className="size-4 text-muted" />
                      {ENTITY_LABEL[e]}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted">{ENTITY_HINT[entity]}</p>
            </div>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                const f = e.dataTransfer.files[0];
                if (f) onFile(f);
              }}
              className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center transition-colors", drag ? "border-fg bg-surface-2" : "border-border")}
            >
              <FileUp className="mb-3 size-6 text-subtle" />
              <p className="text-[13px] font-medium">Drop a CSV file here</p>
              <p className="mt-1 text-xs text-muted">In Google Sheets: File → Download → Comma-separated values (.csv)</p>
              <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
              <Button className="mt-4" size="sm" onClick={() => fileRef.current?.click()}>
                Choose file
              </Button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] text-muted">
                <span className="font-medium text-fg">{fileName}</span> · {rows.length} rows · {headers.length} columns. Match your columns to NOISE OS fields.
              </p>
              <Select value={entity} onChange={(e) => { const v = e.target.value as ImportEntity; setEntity(v); setMapping(autoMap(v, headers)); }} className="w-auto" aria-label="Import type">
                {(Object.keys(ENTITY_LABEL) as ImportEntity[]).map((e) => (
                  <option key={e} value={e}>{ENTITY_LABEL[e]}</option>
                ))}
              </Select>
            </div>
            <div className="divide-y divide-border rounded-lg border border-border">
              {fields.map((f) => {
                const sample = mapping[f.key] ? rows.find((r) => r[mapping[f.key]!])?.[mapping[f.key]!] : undefined;
                return (
                  <div key={f.key} className="grid grid-cols-1 items-center gap-2 px-3 py-2 sm:grid-cols-[1fr_1fr_1fr]">
                    <div className="text-[13px]">
                      {f.label} {f.required && <span className="text-danger">*</span>}
                    </div>
                    <Select
                      value={mapping[f.key] ?? ""}
                      onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || null })}
                      aria-label={`Column for ${f.label}`}
                      aria-invalid={f.required && !mapping[f.key]}
                    >
                      <option value="">— Don&apos;t import —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </Select>
                    <div className="truncate text-xs text-subtle">{sample ? `e.g. ${sample}` : ""}</div>
                  </div>
                );
              })}
            </div>
            {missingRequired.length > 0 && <p className="text-xs text-danger">Map the required fields: {missingRequired.map((f) => f.label).join(", ")}</p>}
            <div className="flex justify-between">
              <Button variant="ghost" onClick={reset}>
                <ArrowLeft /> Start over
              </Button>
              <Button variant="primary" disabled={missingRequired.length > 0} loading={pending} onClick={runPreview}>
                Review rows <ArrowRight />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && analysis && counts && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Badge tone="success">{counts.ok} ready</Badge>
              {counts.dups > 0 && <Badge tone="warning">{counts.dups} possible duplicates</Badge>}
              {counts.errors > 0 && <Badge tone="danger">{counts.errors} with errors</Badge>}
            </div>
            <p className="text-xs text-muted">Rows with errors can&apos;t be imported — fix them in your sheet and import again. Duplicates are skipped unless you choose to create them. Existing records are never changed.</p>
            <div className="max-h-[55vh] overflow-auto rounded-lg border border-border scrollbar-thin">
              <Table>
                <THead>
                  <TR>
                    <TH className="w-12">Row</TH>
                    <TH className="w-32">Action</TH>
                    {previewCols.map((f) => (
                      <TH key={f.key}>{f.label}</TH>
                    ))}
                    <TH>Checks</TH>
                  </TR>
                </THead>
                <TBody>
                  {analysis.map((a) => {
                    const canCreate = !a.errors.length && !a.blocked;
                    return (
                      <TR key={a.index} className={cn("align-top", a.errors.length ? "bg-danger-bg/40" : a.duplicate ? "bg-warning-bg/40" : undefined)}>
                        <TD className="tabular text-muted">{a.index + 1}</TD>
                        <TD>
                          {canCreate ? (
                            <Select
                              value={decisions[a.index]}
                              onChange={(e) => setDecisions(decisions.map((d, i) => (i === a.index ? (e.target.value as "create" | "skip") : d)))}
                              className="h-7 w-24 text-xs"
                              aria-label={`Action for row ${a.index + 1}`}
                            >
                              <option value="create">Create</option>
                              <option value="skip">Skip</option>
                            </Select>
                          ) : (
                            <span className="text-xs text-subtle">Skip</span>
                          )}
                        </TD>
                        {previewCols.map((f) => (
                          <TD key={f.key} className="max-w-48 truncate">{fmt(f.key, a.values[f.key])}</TD>
                        ))}
                        <TD className="min-w-56 py-2 text-xs">
                          {a.errors.map((e) => (
                            <div key={e} className="flex gap-1 text-danger"><AlertTriangle className="mt-0.5 size-3 shrink-0" /> {e}</div>
                          ))}
                          {a.duplicate && (
                            <div className="flex gap-1 text-warning"><Copy className="mt-0.5 size-3 shrink-0" /> {a.duplicate === "existing" ? (a.blocked ? "Invoice number already exists" : "Looks like an existing record") : "Repeated in this file"}</div>
                          )}
                          {a.warnings.map((w) => (
                            <div key={w} className="text-muted">{w}</div>
                          ))}
                          {!a.errors.length && !a.duplicate && !a.warnings.length && <span className="text-success">OK</span>}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft /> Back to mapping
              </Button>
              <Button variant="primary" disabled={counts.toCreate === 0} loading={pending} onClick={runCommit}>
                Import {counts.toCreate} {counts.toCreate === 1 ? "row" : "rows"}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && result && (
          <div className="flex flex-col items-center py-8 text-center">
            <CheckCircle2 className="mb-3 size-8 text-success" />
            <p className="text-sm font-medium">Import finished</p>
            <p className="mt-1 text-[13px] text-muted">
              {result.created} created · {result.skipped} skipped · {result.failed} failed
            </p>
            <div className="mt-5 flex gap-2">
              <Button asChild size="sm">
                <Link href={`/import/${result.logId}`}>View import log</Link>
              </Button>
              <Button size="sm" variant="primary" onClick={reset}>
                <RotateCcw /> Import another file
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
