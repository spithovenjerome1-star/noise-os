import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/server/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { CATEGORY_LABEL } from "@/lib/domain/packages";
import { StagesEditor } from "./stages-editor";

export const metadata = { title: "Pipeline stages" };

export default async function StagesPage() {
  await requireUser("settings:manage");
  const stages = await db.stage.findMany({ where: { archived: false }, orderBy: { position: "asc" }, include: { _count: { select: { videos: true } } } });
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/videos" className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-fg"><ArrowLeft className="size-3.5" /> Production</Link>
      <PageHeader
        title="Pipeline stages"
        description="Rename, reorder and add stages to match how you work. Each stage has a category — package progress (planned, filmed, editing, awaiting approval, approved, delivered) is calculated from categories, so you can change stage names freely without breaking video counts."
      />
      <Card className="mb-4 p-4 text-[13px] text-muted">
        <p className="mb-2 font-medium text-fg">How categories count</p>
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {Object.entries(CATEGORY_LABEL).map(([k, l]) => (
            <li key={k}><span className="font-medium text-fg">{l}</span>{k === "DELIVERED" ? " — reduces videos remaining on the package" : k === "APPROVED" ? " — counted as completed, not yet delivered" : ""}</li>
          ))}
        </ul>
        <p className="mt-2">Moving a video out of a “Planned” stage stamps today as the filming date (if none is set), which starts the delivery deadline.</p>
      </Card>
      <StagesEditor stages={stages.map((s) => ({ id: s.id, name: s.name, category: s.category, color: s.color, count: s._count.videos }))} />
    </div>
  );
}
