import { describe, it, expect } from "vitest";
import { approvalState, changedSections, contentOf, emptyContent, formatForWhatsApp, statusAfterEdit, canSetStatusManually } from "@/lib/domain/scripts";
import { stageAfterClientDecision, clientCanReviewVideo } from "@/lib/domain/portal";

describe("approvalState", () => {
  it("none when never approved", () => expect(approvalState({ revision: 4 }, null)).toEqual({ kind: "none" }));
  it("current when no edits after approved snapshot", () =>
    expect(approvalState({ revision: 4 }, { version: 3, revision: 4 })).toEqual({ kind: "current", version: 3 }));
  it("outdated once the draft was edited after approval", () =>
    expect(approvalState({ revision: 5 }, { version: 3, revision: 4 })).toEqual({ kind: "outdated", version: 3 }));
});

describe("statusAfterEdit", () => {
  it("reverts approved scripts to draft", () => expect(statusAfterEdit("APPROVED")).toBe("DRAFT"));
  it("keeps other statuses", () => {
    expect(statusAfterEdit("DRAFT")).toBe("DRAFT");
    expect(statusAfterEdit("CHANGES_REQUESTED")).toBe("CHANGES_REQUESTED");
  });
  it("approval cannot be set manually", () => {
    expect(canSetStatusManually("APPROVED")).toBe(false);
    expect(canSetStatusManually("SENT")).toBe(false);
    expect(canSetStatusManually("INTERNAL_REVIEW")).toBe(true);
  });
});

describe("content helpers", () => {
  it("contentOf ignores unknown keys and non-strings", () => {
    const c = contentOf({ hook: "Hi", cta: 5, evil: "x" });
    expect(c.hook).toBe("Hi");
    expect(c.cta).toBe("");
    expect("evil" in c).toBe(false);
  });
  it("changedSections compares trimmed text", () => {
    const a = { ...emptyContent(), hook: "A", cta: "Buy " };
    const b = { ...emptyContent(), hook: "B", cta: "Buy" };
    expect(changedSections(a, b)).toEqual(["hook"]);
  });
});

describe("formatForWhatsApp", () => {
  const c = { ...emptyContent(), hook: "## Stop scrolling", shotList: "- Wide\n- Close **up**", notes: "internal", editingNotes: "fast cuts" };
  it("uses bold headings and bullets, skips empty and internal sections", () => {
    const t = formatForWhatsApp("Burger *Reel*", c);
    expect(t.startsWith("*Burger Reel*")).toBe(true);
    expect(t).toContain("*HOOK*\nStop scrolling");
    expect(t).toContain("• Wide\n• Close *up*");
    expect(t).not.toContain("internal");
    expect(t).not.toContain("fast cuts");
    expect(t).not.toContain("VOICEOVER");
  });
  it("can include internal sections", () => {
    expect(formatForWhatsApp("X", c, { includeInternal: true })).toContain("*EDITING INSTRUCTIONS*\nfast cuts");
  });
});

describe("portal stage moves", () => {
  const stages = [
    { id: "1", name: "Editing", position: 4, category: "EDITING" as const },
    { id: "2", name: "Client review", position: 6, category: "AWAITING_APPROVAL" as const },
    { id: "3", name: "Revision", position: 7, category: "EDITING" as const },
    { id: "4", name: "Approved", position: 8, category: "APPROVED" as const },
  ];
  it("approval goes to first APPROVED stage", () => expect(stageAfterClientDecision(stages, "APPROVED")?.id).toBe("4"));
  it("revision prefers a stage named Revision", () => expect(stageAfterClientDecision(stages, "CHANGES_REQUESTED")?.id).toBe("3"));
  it("falls back to first editing stage", () =>
    expect(stageAfterClientDecision(stages.filter((s) => s.id !== "3"), "CHANGES_REQUESTED")?.id).toBe("1"));
  it("only reviewable while awaiting approval", () => {
    expect(clientCanReviewVideo("AWAITING_APPROVAL")).toBe(true);
    expect(clientCanReviewVideo("EDITING")).toBe(false);
  });
});
