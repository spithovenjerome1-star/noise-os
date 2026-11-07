import "server-only";
import { cookies, headers } from "next/headers";
import { createHash } from "node:crypto";
import { resolveShareToken } from "../share-links";
import { UserError } from "../action";

export const PORTAL_NAME_COOKIE = "noise_portal_name";

export async function portalIpHash() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${ip}|${process.env.CRON_SECRET || "noise-portal"}`).digest("hex").slice(0, 32);
}

export async function getPortalName() {
  const v = (await cookies()).get(PORTAL_NAME_COOKIE)?.value;
  return v ? decodeURIComponent(v).slice(0, 80) : null;
}

/**
 * Resolve the link and the person acting. Called at the start of EVERY portal action:
 * nothing from the browser is trusted beyond the raw token.
 */
export async function portalActor(token: string, nameInput?: string | null) {
  const link = await resolveShareToken(token);
  if (!link) throw new UserError("This link is no longer active. Please ask for a new one.");
  const cleaned = nameInput?.trim().replace(/\s+/g, " ").slice(0, 80) || null;
  const name = cleaned || (await getPortalName());
  if (!name) throw new UserError("Please enter your name first.");
  if (cleaned) {
    (await cookies()).set(PORTAL_NAME_COOKIE, encodeURIComponent(cleaned), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/portal",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return { link, name, ipHash: await portalIpHash() };
}
