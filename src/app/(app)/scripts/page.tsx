import Link from "next/link";
import { FileText, Plus, CheckCircle2, AlertTriangle } from "lucide-react";
import type { Prisma, ScriptStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { clientOptions } from "@/server/lookups";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { SCRIPT_STATUS, options } from "@/lib/labels";
import { approvalState } from "@/lib/domain/scripts";
import { timeAgo } from "@/lib/dates";
import { NewScriptDialog } from "./new-script-dialog";
import { ScriptFilters } from "./script-filters";

export const metadata = { title: "Scripts" };

export default async function ScriptsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const q = sp.q?.trim();
  const status = sp.status && sp.status in SCRIPT_STATUS ? (sp.status as ScriptStatus) : undefined;
  const where: Prisma.ScriptWhereInput = {
    ...(status ? { status } : {}),
    ...(sp.client ? { clientId: sp.client } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { hook: { contains: q, mode: "insensitive" } }, { mainContent: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [scripts, clients, videos, total] = await Promise.all([
    db.script.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 300,
      include: {
        client: { select: { id: true, name: true } },
        video: { select: { id: true, title: true } },
        approvedVersion: { select: { version: true, revision: true } },
        _count: { select: { comments: { where: { resolved: false, source: "CLIENT" } } } },
      },
    }),
    clientOptions(),
    db.video.findMany({ where: { script: null, stage: { category: { not: "DELIVERED" } } }, select: { id: true, title: true, clientId: true }, orderBy: { createdAt: "desc" }, take: 500 }),
    db.script.count(),
  ]);

  return (
    <>
      <PageHeader
        title="Scripts"
        description="Write, version and get client sign-off on every script."
        actions={
          <NewScriptDialog clients={clients} videos={videos} defaultOpen={sp.new === "1"} defaultClientId={sp.client} defaultVideoId={sp.video}>
            <Button variant="primary"><Plus /> New script</Button>
          </NewScriptDialog>
        }
      >
        {total > 0 && <ScriptFilters clients={clients} statuses={options(SCRIPT_STATUS)} />}
      </PageHeader>

      {total === 0 ? (
        <EmptyState
          icon={FileText}
          title="No scripts yet"
          description="Scripts live next to their videos. Write one, send it for approval, and keep every version on record."
          action={
            <NewScriptDialog clients={clients} videos={videos}>
              <Button variant="primary"><Plus /> Write your first script</Button>
            </NewScriptDialog>
          }
        />
      ) : scripts.length === 0 ? (
        <EmptyState icon={FileText} title="No scripts match these filters" action={<Button asChild variant="secondary"><Link href="/scripts">Clear filters</Link></Button>} />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH>Script</TH>
                <TH className="hidden md:table-cell">Client</TH>
                <TH>Status</TH>
                <TH className="hidden lg:table-cell">Approval</TH>
                <TH className="hidden sm:table-cell text-right">Updated</TH>
              </TR>
            </THead>
            <TBody>
              {scripts.map((s) => {
                const ap = approvalState(s, s.approvedVersion);
                return (
                  <TR key={s.id} className="hover:bg-surface-2/60">
                    <TD className="max-w-0 w-full">
                      <Link href={`/scripts/${s.id}`} className="block truncate font-medium hover:underline">{s.title}</Link>
                      <div className="truncate text-xs text-subtle">
                        <span className="md:hidden">{s.client.name} · </span>
                        {s.video ? `Video: ${s.video.title}` : "Not linked to a video"}
                      </div>
                    </TD>
                    <TD className="hidden whitespace-nowrap md:table-cell text-muted">{s.client.name}</TD>
                    <TD>
                      <div className="flex items-center gap-1.5">
                        <Badge tone={SCRIPT_STATUS[s.status].tone} dot>{SCRIPT_STATUS[s.status].label}</Badge>
                        {s._count.comments > 0 && <Badge tone="warning">{s._count.comments} client note{s._count.comments > 1 ? "s" : ""}</Badge>}
                      </div>
                    </TD>
                    <TD className="hidden lg:table-cell whitespace-nowrap text-xs">
                      {ap.kind === "current" && <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="size-3.5" /> v{ap.version} approved</span>}
                      {ap.kind === "outdated" && <span className="inline-flex items-center gap-1 text-warning"><AlertTriangle className="size-3.5" /> v{ap.version} outdated</span>}
                      {ap.kind === "none" && <span className="text-subtle">—</span>}
                    </TD>
                    <TD className="hidden sm:table-cell whitespace-nowrap text-right text-xs text-subtle">{timeAgo(s.updatedAt)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
