import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { HEALTH_LABEL, type HealthResult } from "@/lib/domain/health";

export function HealthBadge({ health }: { health: HealthResult }) {
  const l = HEALTH_LABEL[health.level];
  return (
    <Tooltip content={<ul className="list-disc pl-3">{health.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}>
      <span tabIndex={0} className="inline-flex">
        <Badge tone={l.tone} dot>{l.label}</Badge>
      </span>
    </Tooltip>
  );
}
