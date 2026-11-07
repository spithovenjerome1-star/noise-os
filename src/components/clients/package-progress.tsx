import type { PeriodProgress } from "@/lib/domain/packages";
import { Progress } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

/** Delivered (solid) · approved (teal) · in production (light) segments. */
export function PackageProgressBar({ progress, className }: { progress: PeriodProgress; className?: string }) {
  const inc = progress.included || Math.max(1, progress.assigned);
  const pct = (n: number) => (n / inc) * 100;
  const inProd = progress.counts.FILMED + progress.counts.EDITING + progress.counts.AWAITING_APPROVAL;
  return (
    <Progress
      value={progress.pctDelivered}
      className={cn("h-2", className)}
      segments={[
        { value: pct(progress.delivered), className: "bg-success" },
        { value: pct(progress.approvedNotDelivered), className: "bg-teal-500/70" },
        { value: pct(inProd), className: "bg-fg/25" },
      ]}
    />
  );
}

export function PackageProgressSummary({ progress, compact }: { progress: PeriodProgress; compact?: boolean }) {
  const { delivered, included, remaining } = progress;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="tabular">
          <span className="font-semibold">{delivered}</span>
          <span className="text-muted"> delivered / {included} included</span>
        </span>
        <span className={cn("tabular text-xs", remaining > 0 ? "text-fg" : "text-success")}>{remaining > 0 ? `${remaining} remaining` : "Complete"}</span>
      </div>
      <PackageProgressBar progress={progress} />
      {!compact && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
          <Legend className="bg-success" label={`${delivered} delivered`} />
          <Legend className="bg-teal-500/70" label={`${progress.approvedNotDelivered} approved`} />
          <Legend className="bg-fg/25" label={`${progress.counts.FILMED + progress.counts.EDITING + progress.counts.AWAITING_APPROVAL} in production`} />
          <Legend className="bg-surface-3" label={`${progress.counts.PLANNED} planned`} />
          {progress.unplanned > 0 && <span>{progress.unplanned} not yet planned</span>}
          {progress.extras > 0 && <span>+{progress.extras} extra</span>}
          {progress.overage > 0 && <span className="text-warning">{progress.overage} over quota</span>}
        </div>
      )}
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn("size-2 rounded-full", className)} />
      {label}
    </span>
  );
}
