"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewVideoDialog, type VideoFormData } from "@/components/videos/video-form";
import { VideoBoard } from "@/components/videos/board";
import type { VideoDTO } from "@/server/videos/queries";

/** Holds the "new video" dialog so the header button, ?new=1 and board column "+" share it. */
export function VideosBoardClient({
  formData,
  stages,
  videos,
  today,
  warningDays,
  canCreate,
}: {
  formData: VideoFormData;
  stages: { id: string; name: string; color: string; category: VideoDTO["category"] }[];
  videos: VideoDTO[];
  today: string;
  warningDays: number;
  canCreate: boolean;
}) {
  const [stageId, setStageId] = React.useState<string | undefined>();
  return (
    <>
      <NewVideoControl formData={formData} stageId={stageId} onStageReset={() => setStageId(undefined)} canCreate={canCreate} hideButton />
      <VideoBoard stages={stages} videos={videos} today={today} warningDays={warningDays} onAdd={canCreate ? (id) => { setStageId(id); window.dispatchEvent(new CustomEvent("noise:new-video")); } : undefined} />
    </>
  );
}

export function NewVideoControl({ formData, stageId, onStageReset, canCreate, hideButton }: { formData: VideoFormData; stageId?: string; onStageReset?: () => void; canCreate: boolean; hideButton?: boolean }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    if (sp.get("new") === "1" && canCreate && !hideButton) setOpen(true);
  }, [sp, canCreate, hideButton]);
  React.useEffect(() => {
    if (!hideButton) return;
    const h = () => setOpen(true);
    window.addEventListener("noise:new-video", h);
    return () => window.removeEventListener("noise:new-video", h);
  }, [hideButton]);
  if (!canCreate) return null;
  const close = (o: boolean) => {
    setOpen(o);
    if (!o) {
      onStageReset?.();
      if (sp.get("new")) {
        const next = new URLSearchParams(sp.toString());
        next.delete("new");
        router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
      }
    }
  };
  return (
    <NewVideoDialog
      key={stageId ?? "default"}
      data={formData}
      open={open}
      onOpenChange={close}
      defaults={{ stageId, clientId: sp.get("client") ?? undefined }}
      trigger={hideButton ? undefined : <Button variant="primary"><Plus /> New video</Button>}
    />
  );
}
