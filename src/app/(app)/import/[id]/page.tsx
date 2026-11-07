import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/server/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtMoment } from "@/lib/dates";
import { ENTITY_LABEL, type ImportEntity } from "@/lib/domain/import";

const HREF: Record<string, (id: string) => string> = {
  clients: (id) => `/clients/${id}`,
  invoices: (id) => `/invoices/${id}`,
  expenses: (id) => `/expenses?expense=${id}`,
  packages: () => `/packages`,
  tasks: (id) => `/tasks?task=${id}`,
};

export default async function ImportLogPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("data:import");
  const { id } = await params;
  const log = await db.importLog.findUnique({ where: { id }, include: { records: { orderBy: { rowIndex: "asc" } } } });
  if (!log) notFound();
  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/import" className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> Import
      </Link>
      <PageHeader
        title={log.fileName}
        description={`${ENTITY_LABEL[log.entity as ImportEntity] ?? log.entity} · ${fmtMoment(log.createdAt)} · ${log.rowsTotal} rows: ${log.created} created, ${log.skipped} skipped, ${log.failed} failed`}
      />
      <Card>
        <Table>
          <THead>
            <TR>
              <TH className="w-14">Row</TH>
              <TH className="w-28">Result</TH>
              <TH>Original values</TH>
              <TH>Notes</TH>
            </TR>
          </THead>
          <TBody>
            {log.records.map((r) => {
              const raw = r.raw as Record<string, string>;
              return (
                <TR key={r.id} className="align-top">
                  <TD className="tabular text-muted">{r.rowIndex}</TD>
                  <TD>
                    {r.status === "CREATED" && r.entityId ? (
                      <Link href={HREF[log.entity]?.(r.entityId) ?? "#"}>
                        <Badge tone="success">Created</Badge>
                      </Link>
                    ) : (
                      <Badge tone={r.status === "FAILED" ? "danger" : "neutral"}>{r.status === "FAILED" ? "Failed" : "Skipped"}</Badge>
                    )}
                  </TD>
                  <TD className="max-w-md py-2">
                    <div className="line-clamp-3 text-xs text-muted">
                      {Object.entries(raw)
                        .filter(([, v]) => v)
                        .map(([k, v]) => (
                          <span key={k} className="mr-2">
                            <span className="text-subtle">{k}:</span> {v}
                          </span>
                        ))}
                    </div>
                  </TD>
                  <TD className="py-2 text-xs text-muted">{r.message}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
