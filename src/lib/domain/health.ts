import type { ClientStatus } from "@prisma/client";

export type HealthLevel = "healthy" | "watch" | "at-risk";

export type HealthInput = {
  status: ClientStatus;
  overdueInvoices: number;
  overdueCents: number;
  /** Average days late on paid invoices (null when there is no history). */
  avgDaysLate: number | null;
  /** Videos that went through a revision / total videos with feedback. 0..1 */
  revisionRatio: number | null;
  /** Hours logged in the window and revenue (net cents) in the same window. */
  hoursLogged: number;
  revenueCents: number;
  /** Target effective hourly rate in cents used to judge workload vs revenue. */
  targetHourlyCents?: number;
  daysSinceActivity: number | null;
};

export type HealthResult = { level: HealthLevel; score: number; reasons: string[] };

/**
 * Client health: a simple, explainable score. Each signal adds penalty points
 * and a human-readable reason. 0–1 → healthy, 2–3 → watch, 4+ → at risk.
 */
export function clientHealth(i: HealthInput): HealthResult {
  const reasons: string[] = [];
  let score = 0;
  if (i.status === "FORMER" || i.status === "LEAD") {
    return { level: "healthy", score: 0, reasons: [i.status === "LEAD" ? "Lead — not yet active" : "Former client"] };
  }
  if (i.overdueInvoices > 0) {
    const big = i.overdueInvoices >= 2 || i.overdueCents >= 100000;
    score += big ? 3 : 2;
    reasons.push(`${i.overdueInvoices} overdue invoice${i.overdueInvoices === 1 ? "" : "s"}`);
  }
  if (i.avgDaysLate !== null && i.avgDaysLate > 7) {
    score += i.avgDaysLate > 21 ? 2 : 1;
    reasons.push(`Pays on average ${Math.round(i.avgDaysLate)} days late`);
  }
  if (i.revisionRatio !== null && i.revisionRatio >= 0.4) {
    score += i.revisionRatio >= 0.7 ? 2 : 1;
    reasons.push(`Frequent revisions (${Math.round(i.revisionRatio * 100)}% of videos)`);
  }
  const target = i.targetHourlyCents ?? 2500;
  if (i.hoursLogged >= 5) {
    const effective = i.revenueCents / i.hoursLogged;
    if (effective < target) {
      score += effective < target / 2 ? 2 : 1;
      reasons.push(`High workload vs revenue (≈€${Math.round(effective / 100)}/h)`);
    }
  }
  if (i.status === "ACTIVE" && i.daysSinceActivity !== null && i.daysSinceActivity > 30) {
    score += 1;
    reasons.push(`No activity for ${i.daysSinceActivity} days`);
  }
  if (i.status === "PAUSED") reasons.push("Paused");
  const level: HealthLevel = score >= 4 ? "at-risk" : score >= 2 ? "watch" : "healthy";
  if (!reasons.length) reasons.push("Paying on time, workload in balance");
  return { level, score, reasons };
}

export const HEALTH_LABEL: Record<HealthLevel, { label: string; tone: "success" | "warning" | "danger" }> = {
  healthy: { label: "Healthy", tone: "success" },
  watch: { label: "Watch", tone: "warning" },
  "at-risk": { label: "At risk", tone: "danger" },
};
