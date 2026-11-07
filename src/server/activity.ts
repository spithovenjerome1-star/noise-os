import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { CurrentUser } from "./auth";

type Tx = Prisma.TransactionClient | typeof db;

export async function logActivity(
  input: {
    actor?: CurrentUser | null;
    actorLabel?: string;
    action: string;
    entityType: string;
    entityId?: string | null;
    clientId?: string | null;
    summary: string;
    meta?: Prisma.InputJsonValue;
  },
  tx: Tx = db,
) {
  await tx.activityLog.create({
    data: {
      actorId: input.actor?.id ?? null,
      actorLabel: input.actorLabel ?? input.actor?.name ?? "System",
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      clientId: input.clientId ?? null,
      summary: input.summary,
      meta: input.meta,
    },
  });
}
