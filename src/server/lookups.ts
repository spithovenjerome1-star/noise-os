import "server-only";
import { db } from "@/lib/db";

// Small option lists used by forms across the app.
export async function clientOptions(includeArchived = false) {
  const rows = await db.client.findMany({
    where: includeArchived ? {} : { archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

export async function userOptions() {
  const rows = await db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

export async function stageList() {
  return db.stage.findMany({ where: { archived: false }, orderBy: { position: "asc" } });
}

export async function projectOptions(clientId?: string) {
  const rows = await db.project.findMany({
    where: { status: { in: ["ACTIVE", "ON_HOLD"] }, ...(clientId ? { clientId } : {}) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, client: { select: { name: true } } },
  });
  return rows.map((r) => ({ value: r.id, label: clientId ? r.name : `${r.client.name} — ${r.name}` }));
}
