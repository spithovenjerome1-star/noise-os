import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

export const getSettings = cache(async () => {
  return db.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
});

export async function getVatRates() {
  return db.vatRate.findMany({ where: { archived: false }, orderBy: [{ position: "asc" }, { rateBp: "desc" }] });
}
