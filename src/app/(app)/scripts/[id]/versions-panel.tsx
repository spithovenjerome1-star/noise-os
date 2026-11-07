"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { History, CheckCircle2, Send, RotateCcw, XCircle } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SCRIPT_SECTIONS, changedSections, type ScriptContent } from "@/lib/domain/scripts";
import { restoreScriptVersion } from "@/server/scripts/actions";
import { timeAgo } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type VersionRow = {
  id: string;
  version: number;
  revision: number;
  label: string | null;
  sentToClient: boolean;
  createdAt: string;
  createdBy: string | null;
  content: ScriptContent;
  approvals: { id: string; decision: "APPROVED" | "CHANGES_REQUESTED"; byName: string; note: string | null; createdAt: string; shareLinkId: string | null }[];
};

export function VersionsPanel({
  scriptId,
  versions,
  current,
  approvedVersionId,
  revision,
  beforeAction,
}: {
  scriptId: string;
  versions: VersionRow[];
  current: ScriptContent;
  approvedVersionId: string | null;
  revision: number;
  beforeAction: () => Promise<void>;
}) {
  const [viewing, setViewing] = React.useState<VersionRow | null>(null);
  const [restoring, setRestoring] = React.useState(false);
  const router = useRouter();

  return (
    <Card>
      <CardHeader title="Versions" description={versions.length ? "Frozen snapshots. Approvals always point to one." : undefined} />
      <div className="px-2 pb-2">
        {versions.length === 0 ? (
          <p className="flex items-center gap-2 px-2 pb-2 text-[13px] text-muted"><History className="size-4" /> No versions yet. Save one or send to the client.</p>
        ) : (
          <ul className="flex flex-col">
            {versions.map((v) => {
              const latestDecision = v.approvals[0];
              const isApproved = v.id === approvedVersionId;
              const matchesCurrent = v.revision === revision;
              return (
                <li key={v.id}>
                  <button
                    onClick={() => setViewing(v)}
                    className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-2"
                  >
                    <span className={cn("mt-0.5 flex h-5 min-w-7 items-center justify-center rounded bg-surface-2 px-1 text-[11px] font-semibold tabular", isApproved && "bg-success-bg text-success")}>v{v.version}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5 text-[13px]">
                        {v.label ?? (v.sentToClient ? "Sent to client" : "Saved version")}
                        {matchesCurrent && <span className="text-[11px] text-subtle">· current</span>}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        {v.sentToClient && <Badge tone="violet"><Send className="size-2.5" /> Sent</Badge>}
                        {latestDecision?.decision === "APPROVED" && <Badge tone="success"><CheckCircle2 className="size-2.5" /> {latestDecision.byName}</Badge>}
                        {latestDecision?.decision === "CHANGES_REQUESTED" && <Badge tone="warning"><XCircle className="size-2.5" /> Changes · {latestDecision.byName}</Badge>}
                        <span className="text-[11px] text-subtle">{timeAgo(new Date(v.createdAt))}{v.createdBy ? ` · ${v.createdBy}` : ""}</span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={Boolean(viewing)} onOpenChange={(o) => !o && setViewing(null)}>
        {viewing && (
          <DialogContent wide title={`Version ${viewing.version}${viewing.label ? ` — ${viewing.label}` : ""}`} description="Highlighted sections differ from the current draft.">
            <VersionCompare version={viewing} current={current} />
            {viewing.approvals.length > 0 && (
              <div className="mt-5">
                <h4 className="mb-2 text-xs font-medium text-muted">Client decisions on this version</h4>
                <ul className="flex flex-col gap-1.5">
                  {viewing.approvals.map((a) => (
                    <li key={a.id} className="rounded-md bg-surface-2 px-3 py-2 text-[13px]">
                      <span className={a.decision === "APPROVED" ? "text-success" : "text-warning"}>{a.decision === "APPROVED" ? "Approved" : "Changes requested"}</span> by {a.byName}
                      <span className="text-subtle"> · {new Date(a.createdAt).toLocaleString("en-GB", { timeZone: "Europe/Malta", dateStyle: "medium", timeStyle: "short" })}{a.shareLinkId ? " · via portal" : ""}</span>
                      {a.note && <p className="mt-1 whitespace-pre-wrap text-muted">{a.note}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="-mx-5 -mb-4 mt-5 flex justify-end gap-2 border-t border-border bg-surface-2/50 px-5 py-3">
              <Button variant="ghost" onClick={() => setViewing(null)}>Close</Button>
              <Button
                loading={restoring}
                onClick={async () => {
                  if (!confirm(`Replace the current draft with v${viewing.version}? The current text stays recoverable only if saved as a version.`)) return;
                  setRestoring(true);
                  await beforeAction();
                  const r = await restoreScriptVersion(scriptId, viewing.id);
                  setRestoring(false);
                  if (r.ok) {
                    toast.success(r.message ?? "Restored");
                    setViewing(null);
                    router.refresh();
                  } else toast.error(r.error);
                }}
              >
                <RotateCcw /> Restore into draft
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}

function VersionCompare({ version, current }: { version: VersionRow; current: ScriptContent }) {
  const changed = new Set(changedSections(version.content, current));
  const sections = SCRIPT_SECTIONS.filter((s) => version.content[s.key].trim() || current[s.key].trim());
  if (!sections.length) return <p className="text-[13px] text-muted">Both are empty.</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="hidden grid-cols-2 gap-3 text-[11px] font-medium uppercase tracking-wide text-subtle sm:grid">
        <span>v{version.version}</span>
        <span>Current draft</span>
      </div>
      {sections.map((s) => {
        const diff = changed.has(s.key);
        return (
          <div key={s.key} className={cn("rounded-lg border border-border", diff && "border-warning/40")}>
            <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs font-medium text-muted">
              {s.label}
              {diff ? <Badge tone="warning">Changed</Badge> : <span className="text-[11px] text-subtle">Same</span>}
            </div>
            <div className={cn("grid grid-cols-1 sm:grid-cols-2", diff ? "divide-y divide-border sm:divide-x sm:divide-y-0" : "")}>
              <p className="whitespace-pre-wrap px-3 py-2 text-[13px] leading-relaxed">{version.content[s.key] || <span className="text-subtle">—</span>}</p>
              {diff && <p className="whitespace-pre-wrap bg-warning-bg/40 px-3 py-2 text-[13px] leading-relaxed">{current[s.key] || <span className="text-subtle">—</span>}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
