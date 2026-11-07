"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Send, Save, MoreHorizontal, Trash2, Pencil, CheckCircle2, AlertTriangle, Clapperboard, Check, Loader2, CircleDashed, ShieldCheck } from "lucide-react";
import type { ScriptStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { CopyButton } from "@/components/copy-button";
import { FormDialog } from "@/components/form";
import { SelectField, TextAreaField, TextField } from "@/components/fields";
import { SCRIPT_STATUS } from "@/lib/labels";
import { SCRIPT_SECTIONS, approvalState, formatForWhatsApp, type ScriptContent, type SectionKey } from "@/lib/domain/scripts";
import { cn } from "@/lib/utils";
import { saveScriptContent, setScriptStatus, saveScriptVersion, sendScriptToClient, updateScriptMeta, deleteScript, recordScriptApproval } from "@/server/scripts/actions";
import { VersionsPanel, type VersionRow } from "./versions-panel";
import { CommentsPanel, type CommentRow } from "./comments-panel";
import { SharePanel, type ShareRow } from "./share-panel";

type ScriptProps = {
  id: string;
  title: string;
  status: ScriptStatus;
  revision: number;
  client: { id: string; name: string };
  video: { id: string; title: string } | null;
  content: ScriptContent;
  approvedVersion: { id: string; version: number; revision: number } | null;
  updatedAt: string;
};

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export function ScriptEditor({
  script,
  versions,
  comments,
  shareLinks,
  videos,
  hasPortal,
}: {
  script: ScriptProps;
  versions: VersionRow[];
  comments: CommentRow[];
  shareLinks: ShareRow[];
  videos: { id: string; title: string }[];
  hasPortal: boolean;
}) {
  const router = useRouter();
  const [content, setContent] = React.useState<ScriptContent>(script.content);
  const [revision, setRevision] = React.useState(script.revision);
  const [status, setStatus] = React.useState<ScriptStatus>(script.status);
  const statusRef = React.useRef(script.status);
  statusRef.current = status;
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const dirty = React.useRef<Set<SectionKey>>(new Set());
  const contentRef = React.useRef(content);
  contentRef.current = content;
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = React.useRef<Promise<void> | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [metaOpen, setMetaOpen] = React.useState(false);
  const [approveOpen, setApproveOpen] = React.useState(false);

  // Server props changed (e.g. after restore) → adopt them when nothing local is pending.
  React.useEffect(() => {
    if (dirty.current.size === 0 && !inflight.current) {
      setContent(script.content);
      setRevision(script.revision);
    }
    setStatus(script.status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script.revision, script.status, script.updatedAt]);

  const flush = React.useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (inflight.current) await inflight.current;
    if (dirty.current.size === 0) return;
    const keys = [...dirty.current];
    dirty.current.clear();
    const patch = Object.fromEntries(keys.map((k) => [k, contentRef.current[k]]));
    setSaveState("saving");
    const p = (async () => {
      const r = await saveScriptContent(script.id, patch);
      if (r.ok && r.data) {
        setRevision(r.data.revision);
        const prev = statusRef.current;
        if (prev !== r.data.status) {
          if (prev === "APPROVED") toast.message("Edited after approval — back to Draft. Send the new version for approval.");
          statusRef.current = r.data.status;
          setStatus(r.data.status);
          router.refresh();
        }
        setSaveState(dirty.current.size ? "dirty" : "saved");
      } else {
        keys.forEach((k) => dirty.current.add(k));
        setSaveState("error");
        toast.error(r.ok ? "Couldn't save" : r.error);
      }
    })();
    inflight.current = p;
    await p;
    inflight.current = null;
    if (dirty.current.size) void flush();
  }, [script.id, router]);

  const onChange = (k: SectionKey, v: string) => {
    setContent((c) => ({ ...c, [k]: v }));
    dirty.current.add(k);
    setSaveState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 800);
  };

  React.useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current.size || inflight.current) {
        e.preventDefault();
        void flush();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flush();
      }
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("keydown", onKey);
      void flush();
    };
  }, [flush]);

  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    setBusy(key);
    await flush();
    const r = await fn();
    setBusy(null);
    if (r.ok) {
      toast.success(r.message ?? "Done");
      router.refresh();
    } else toast.error(r.error ?? "Something went wrong");
    return r.ok;
  };

  const ap = approvalState({ revision }, script.approvedVersion);
  const latestSent = versions.find((v) => v.sentToClient);
  const sentOutdated = status === "SENT" && latestSent && revision > latestSent.revision;
  const wordCount = Object.values(content).join(" ").trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Link href="/scripts" className="inline-flex w-fit items-center gap-1 text-xs text-muted hover:text-fg">
          <ArrowLeft className="size-3.5" /> Scripts
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight">{script.title}</h1>
              <Button variant="ghost" size="icon-sm" onClick={() => setMetaOpen(true)} aria-label="Edit title and video link">
                <Pencil />
              </Button>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
              <Link href={`/clients/${script.client.id}`} className="hover:text-fg hover:underline">{script.client.name}</Link>
              {script.video ? (
                <Link href={`/videos/${script.video.id}`} className="inline-flex items-center gap-1 hover:text-fg hover:underline">
                  <Clapperboard className="size-3.5" /> {script.video.title}
                </Link>
              ) : (
                <button onClick={() => setMetaOpen(true)} className="text-subtle hover:text-fg">Link a video</button>
              )}
              <SaveIndicator state={saveState} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Dropdown>
              <DropdownTrigger asChild>
                <button className="rounded-full focus-visible:outline-2" aria-label="Change status">
                  <Badge tone={SCRIPT_STATUS[status].tone} dot className="h-7 cursor-pointer px-2.5 text-xs">{SCRIPT_STATUS[status].label}</Badge>
                </button>
              </DropdownTrigger>
              <DropdownContent>
                <DropdownLabel>Set status</DropdownLabel>
                {(["DRAFT", "INTERNAL_REVIEW", "CHANGES_REQUESTED"] as ScriptStatus[]).map((s) => (
                  <DropdownItem key={s} disabled={s === status} onSelect={() => run("status", () => setScriptStatus(script.id, s))}>
                    {SCRIPT_STATUS[s].label}
                  </DropdownItem>
                ))}
                <DropdownSeparator />
                <div className="max-w-52 px-2 py-1 text-[11px] leading-snug text-subtle">“Sent” and “Approved” are set by sending a version and by the client’s decision.</div>
              </DropdownContent>
            </Dropdown>
            <CopyButton size="md" label="WhatsApp" text={() => formatForWhatsApp(script.title, contentRef.current, { clientName: script.client.name })} toastMessage="Copied — paste it into WhatsApp" />
            <Button onClick={() => run("version", () => saveScriptVersion(script.id, null))} loading={busy === "version"}>
              <Save /> Save version
            </Button>
            <Button variant="primary" onClick={() => run("send", () => sendScriptToClient(script.id))} loading={busy === "send"}>
              <Send /> Send to client
            </Button>
            <Dropdown>
              <DropdownTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More actions"><MoreHorizontal /></Button>
              </DropdownTrigger>
              <DropdownContent>
                <DropdownItem onSelect={() => setApproveOpen(true)}><ShieldCheck /> Record client approval…</DropdownItem>
                <DropdownItem onSelect={() => setMetaOpen(true)}><Pencil /> Rename / link video</DropdownItem>
                <DropdownSeparator />
                <DropdownItem
                  danger
                  onSelect={async () => {
                    if (!confirm(`Delete “${script.title}” with all versions and comments? This can't be undone.`)) return;
                    const r = await deleteScript(script.id);
                    if (r.ok) {
                      toast.success("Script deleted");
                      router.push("/scripts");
                    } else toast.error(r.error);
                  }}
                >
                  <Trash2 /> Delete script
                </DropdownItem>
              </DropdownContent>
            </Dropdown>
          </div>
        </div>

        {/* Approval / sync banners */}
        {ap.kind === "current" && (
          <Banner tone="success" icon={CheckCircle2}>
            Version {ap.version} is approved and matches the current script.
          </Banner>
        )}
        {ap.kind === "outdated" && (
          <Banner tone="warning" icon={AlertTriangle}>
            <strong className="font-medium">Approved version v{ap.version} is outdated</strong> — the current draft differs. Send the new version to the client before filming from it.
          </Banner>
        )}
        {sentOutdated && ap.kind !== "outdated" && (
          <Banner tone="info" icon={AlertTriangle}>
            You’ve edited the script since v{latestSent!.version} was sent. The client still sees v{latestSent!.version}. Send again to share your changes.
          </Banner>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Sections */}
        <Card className="divide-y divide-border">
          {SCRIPT_SECTIONS.map((s) => (
            <section key={s.key} className="px-4 py-3 transition-colors focus-within:bg-surface-2/40 sm:px-5">
              <label htmlFor={`sec-${s.key}`} className="mb-1 flex items-center gap-2 text-xs font-medium text-muted">
                {s.label}
                {(s.key === "editingNotes" || s.key === "notes") && <span className="rounded bg-surface-2 px-1 text-[10px] font-normal text-subtle">internal</span>}
              </label>
              <AutoTextarea id={`sec-${s.key}`} value={content[s.key]} onChange={(v) => onChange(s.key, v)} placeholder={s.placeholder} large={s.key === "hook"} onBlur={() => void flush()} />
            </section>
          ))}
          <div className="flex items-center justify-between px-5 py-2 text-[11px] text-subtle">
            <span>{wordCount} words · revision {revision}</span>
            <span className="hidden sm:inline">Autosaves as you type · ⌘S to save now</span>
          </div>
        </Card>

        {/* Side panels */}
        <div className="flex flex-col gap-4">
          <VersionsPanel scriptId={script.id} versions={versions} current={content} approvedVersionId={script.approvedVersion?.id ?? null} revision={revision} beforeAction={flush} />
          <CommentsPanel scriptId={script.id} comments={comments} />
          <SharePanel scriptId={script.id} links={shareLinks} hasPortal={hasPortal} status={status} />
        </div>
      </div>

      <FormDialog open={metaOpen} onOpenChange={setMetaOpen} title="Script details" action={(fd) => updateScriptMeta(script.id, fd)} successMessage="Saved">
        <TextField name="title" label="Title" defaultValue={script.title} autoFocus />
        <SelectField name="videoId" label="Linked video" placeholder="Not linked" options={videos.map((v) => ({ value: v.id, label: v.title }))} defaultValue={script.video?.id ?? ""} hint="Only this client's videos without a script are listed." />
      </FormDialog>

      <FormDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title="Record client approval"
        description="For approvals given outside the portal (WhatsApp, email, in person). The current text is frozen as a version and marked approved."
        action={async (fd) => {
          await flush();
          return recordScriptApproval(script.id, fd);
        }}
        submitLabel="Record approval"
        successMessage="Approval recorded"
      >
        <TextField name="byName" label="Approved by" placeholder="Client contact name" autoFocus />
        <TextAreaField name="note" label="Note (optional)" placeholder="e.g. Approved on WhatsApp, 14:20" rows={2} />
      </FormDialog>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const map = {
    dirty: { icon: CircleDashed, text: "Unsaved", cls: "text-subtle" },
    saving: { icon: Loader2, text: "Saving…", cls: "text-subtle [&_svg]:animate-spin" },
    saved: { icon: Check, text: "Saved", cls: "text-success" },
    error: { icon: AlertTriangle, text: "Not saved — retrying on next edit", cls: "text-danger" },
  }[state];
  const Icon = map.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", map.cls)} aria-live="polite">
      <Icon className="size-3.5" /> {map.text}
    </span>
  );
}

function Banner({ tone, icon: Icon, children }: { tone: "success" | "warning" | "info"; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  const cls = { success: "bg-success-bg text-success", warning: "bg-warning-bg text-warning", info: "bg-info-bg text-info" }[tone];
  return (
    <div className={cn("flex items-start gap-2 rounded-lg px-3 py-2 text-[13px]", cls)} role="status">
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="text-fg/90">{children}</div>
    </div>
  );
}

function AutoTextarea({ id, value, onChange, placeholder, large, onBlur }: { id: string; value: string; onChange: (v: string) => void; placeholder: string; large?: boolean; onBlur?: () => void }) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(el.scrollHeight, large ? 44 : 40)}px`;
  }, [value, large]);
  return (
    <textarea
      id={id}
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      rows={1}
      className={cn(
        "block w-full resize-none overflow-hidden bg-transparent leading-relaxed text-fg outline-none focus-visible:outline-none placeholder:text-subtle/70",
        large ? "text-base font-medium md:text-[15px]" : "text-[15px] md:text-sm",
      )}
    />
  );
}
