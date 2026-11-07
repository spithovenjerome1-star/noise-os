import Link from "next/link";
import { requireUser } from "@/server/auth";
import { db } from "@/lib/db";
import { PageHeader, SectionTitle } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtMoment } from "@/lib/dates";
import { ENTITY_LABEL, type ImportEntity } from "@/lib/domain/import";
import { ImportWizard } from "./wizard";

export const metadata = { title: "Import" };

export default async function ImportPage() {
  await requireUser("data:import");
  const logs = await db.importLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Import"
        description="Bring in clients, invoices, expenses, packages and tasks from Google Sheets or any CSV. Nothing is overwritten, and every row is logged with its original values."
      />
      <ImportWizard />
      <div className="mt-10">
        <SectionTitle>Import history</SectionTitle>
        {logs.length === 0 ? (
          <p className="text-[13px] text-muted">No imports yet.</p>
        ) : (
          <Card className="divide-y divide-border">
            {logs.map((l) => (
              <Link key={l.id} href={`/import/${l.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{l.fileName}</div>
                  <div className="text-xs text-muted">
                    {ENTITY_LABEL[l.entity as ImportEntity] ?? l.entity} · {fmtMoment(l.createdAt)}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Badge tone="success">{l.created} created</Badge>
                  {l.skipped > 0 && <Badge>{l.skipped} skipped</Badge>}
                  {l.failed > 0 && <Badge tone="danger">{l.failed} failed</Badge>}
                </div>
              </Link>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
