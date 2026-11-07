import type { ScriptStatus } from "@prisma/client";

export const SCRIPT_SECTIONS = [
  { key: "hook", label: "Hook", placeholder: "The first 2 seconds. What stops the scroll?" },
  { key: "mainContent", label: "Main content", placeholder: "The story, key points, structure…" },
  { key: "shotList", label: "Shot list", placeholder: "One shot per line" },
  { key: "voiceover", label: "Voiceover", placeholder: "Spoken words / VO script" },
  { key: "onScreenText", label: "On-screen text", placeholder: "Captions and text overlays" },
  { key: "cta", label: "Call to action", placeholder: "What should the viewer do next?" },
  { key: "editingNotes", label: "Editing instructions", placeholder: "Pacing, music, transitions, references…" },
  { key: "notes", label: "Additional notes", placeholder: "Anything else" },
] as const;

export type SectionKey = (typeof SCRIPT_SECTIONS)[number]["key"];
export type ScriptContent = Record<SectionKey, string>;

/** Sections a client sees. Internal notes and editing instructions stay internal. */
export const CLIENT_SECTIONS: SectionKey[] = ["hook", "mainContent", "shotList", "voiceover", "onScreenText", "cta"];

export function emptyContent(): ScriptContent {
  return Object.fromEntries(SCRIPT_SECTIONS.map((s) => [s.key, ""])) as ScriptContent;
}

export function contentOf(src: Partial<Record<string, unknown>> | null | undefined): ScriptContent {
  const out = emptyContent();
  if (!src || typeof src !== "object") return out;
  for (const s of SCRIPT_SECTIONS) {
    const v = (src as Record<string, unknown>)[s.key];
    out[s.key] = typeof v === "string" ? v : "";
  }
  return out;
}

/** Keys of sections whose text differs. */
export function changedSections(a: ScriptContent, b: ScriptContent): SectionKey[] {
  return SCRIPT_SECTIONS.filter((s) => (a[s.key] ?? "").trim() !== (b[s.key] ?? "").trim()).map((s) => s.key);
}

export type ApprovalState =
  | { kind: "none" }
  | { kind: "current"; version: number }
  | { kind: "outdated"; version: number };

/**
 * Is the approved version still what the script currently says?
 * An approval only counts while no edits happened after the approved snapshot.
 */
export function approvalState(
  script: { revision: number },
  approved: { version: number; revision: number } | null | undefined,
): ApprovalState {
  if (!approved) return { kind: "none" };
  if (script.revision > approved.revision) return { kind: "outdated", version: approved.version };
  return { kind: "current", version: approved.version };
}

/**
 * Status after a content edit. Editing an approved (or sent) script means the
 * client-facing version no longer matches, so it returns to Draft.
 */
export function statusAfterEdit(status: ScriptStatus): ScriptStatus {
  if (status === "APPROVED") return "DRAFT";
  return status;
}

/** Allowed manual status moves in the editor. Approval itself only comes from an approval record. */
export function canSetStatusManually(to: ScriptStatus) {
  return to === "DRAFT" || to === "INTERNAL_REVIEW" || to === "CHANGES_REQUESTED";
}

/** WhatsApp-friendly plain text: *bold* headings, no markdown clutter. */
export function formatForWhatsApp(title: string, content: ScriptContent, opts?: { includeInternal?: boolean; clientName?: string | null }) {
  const keys = opts?.includeInternal ? SCRIPT_SECTIONS.map((s) => s.key) : CLIENT_SECTIONS;
  const parts: string[] = [`*${title.trim().replace(/\*/g, "")}*`];
  if (opts?.clientName) parts.push(`_${opts.clientName.replace(/_/g, "")}_`);
  for (const k of keys) {
    const text = (content[k] ?? "").replace(/\r\n/g, "\n").trim();
    if (!text) continue;
    const label = SCRIPT_SECTIONS.find((s) => s.key === k)!.label.toUpperCase();
    // Strip markdown that WhatsApp would render oddly (#, **, leading "- [ ]")
    const clean = text
      .split("\n")
      .map((l) => l.replace(/^#{1,6}\s+/, "").replace(/\*\*(.+?)\*\*/g, "*$1*").replace(/^\s*[-*]\s+/, "• "))
      .join("\n");
    parts.push(`*${label}*\n${clean}`);
  }
  return parts.join("\n\n");
}
