import type { StageCategory } from "@prisma/client";

/** Plain-language status for clients. */
export const CLIENT_VIDEO_STATUS: Record<StageCategory, { label: string; tone: "neutral" | "info" | "violet" | "success" | "warning" }> = {
  PLANNED: { label: "Planned", tone: "neutral" },
  FILMED: { label: "Filmed", tone: "info" },
  EDITING: { label: "Being edited", tone: "info" },
  AWAITING_APPROVAL: { label: "Ready for your review", tone: "violet" },
  APPROVED: { label: "Approved", tone: "success" },
  DELIVERED: { label: "Delivered", tone: "success" },
};

/** Clients can act on a video only while it waits for their review. */
export function clientCanReviewVideo(category: StageCategory) {
  return category === "AWAITING_APPROVAL";
}

/** Choose the stage a video moves to after a client decision. */
export function stageAfterClientDecision(
  stages: { id: string; name: string; position: number; category: StageCategory }[],
  decision: "APPROVED" | "CHANGES_REQUESTED",
) {
  const sorted = [...stages].sort((a, b) => a.position - b.position);
  if (decision === "APPROVED") return sorted.find((s) => s.category === "APPROVED") ?? null;
  return sorted.find((s) => /revision/i.test(s.name)) ?? sorted.find((s) => s.category === "EDITING") ?? null;
}
