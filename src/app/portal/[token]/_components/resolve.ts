import "server-only";
import { cache } from "react";
import { resolveShareToken } from "@/server/share-links";

/** Per-request memoized token resolution (layout + page share one lookup). */
export const resolvePortal = cache(async (token: string) => resolveShareToken(token));
