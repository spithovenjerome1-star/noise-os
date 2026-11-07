import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { cache } from "react";
import { db } from "@/lib/db";
import { can, type Capability } from "@/lib/permissions";

export const SESSION_COOKIE = "noise_session";
const SESSION_DAYS = 30;

export function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

export function newToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: string, userAgent?: string | null) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.session.create({ data: { id: sha256(token), userId, expiresAt, userAgent: userAgent?.slice(0, 200) } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

export type CurrentUser = { id: string; name: string; email: string; role: Role };

/** Current user for this request (memoized per request). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: sha256(token) },
    include: { user: { select: { id: true, name: true, email: true, role: true, active: true, canLogin: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active || !session.user.canLogin) return null;
  const { id, name, email, role } = session.user;
  return { id, name, email, role };
});

/** For pages: redirect to login if signed out, or to home if lacking a capability. */
export async function requireUser(cap?: Capability): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (cap && !can(user.role, cap)) redirect("/?denied=1");
  return user;
}

export class AuthError extends Error {}

/** For server actions / route handlers: throws instead of redirecting. */
export async function assertUser(cap?: Capability): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("You are signed out. Please sign in again.");
  if (cap && !can(user.role, cap)) throw new AuthError("You don't have permission to do that.");
  return user;
}
