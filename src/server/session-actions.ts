"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, destroySession, hashPassword, verifyPassword } from "./auth";
import { runAction, formToObject, UserError, type ActionResult } from "./action";
import { logActivity } from "./activity";

// Simple in-memory throttle against password guessing (per email+ip).
const attempts = new Map<string, { n: number; until: number }>();

export async function loginAction(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { email, password } = z
      .object({ email: z.string().trim().toLowerCase().email("Enter your email"), password: z.string().min(1, "Enter your password") })
      .parse(formToObject(fd));
    const h = await headers();
    const key = `${email}|${h.get("x-forwarded-for") ?? "local"}`;
    const a = attempts.get(key);
    if (a && a.n >= 5 && a.until > Date.now()) throw new UserError("Too many attempts. Try again in a few minutes.");
    const user = await db.user.findUnique({ where: { email } });
    const ok = user?.passwordHash && user.active && user.canLogin ? await verifyPassword(password, user.passwordHash) : false;
    if (!ok || !user) {
      const n = (a?.n ?? 0) + 1;
      attempts.set(key, { n, until: Date.now() + 5 * 60_000 });
      throw new UserError("Email or password is incorrect.");
    }
    attempts.delete(key);
    await createSession(user.id, h.get("user-agent"));
    return { ok: true as const, message: `Welcome back, ${user.name.split(" ")[0]}` };
  });
}

export async function setupAction(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const count = await db.user.count();
    if (count > 0) throw new UserError("NOISE OS is already set up. Please sign in.");
    const data = z
      .object({
        name: z.string().trim().min(1, "Enter your name").max(100),
        email: z.string().trim().toLowerCase().email("Enter a valid email"),
        password: z.string().min(10, "Use at least 10 characters").max(200),
        businessName: z.string().trim().min(1).max(100).default("NOISE"),
      })
      .parse(formToObject(fd));
    const user = await db.user.create({
      data: { name: data.name, email: data.email, role: "OWNER", passwordHash: await hashPassword(data.password) },
    });
    await db.settings.upsert({ where: { id: 1 }, update: { businessName: data.businessName }, create: { id: 1, businessName: data.businessName } });
    await logActivity({ actorLabel: data.name, action: "setup", entityType: "system", summary: "Set up NOISE OS" });
    const h = await headers();
    await createSession(user.id, h.get("user-agent"));
    return { ok: true as const, message: "You're all set" };
  });
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
