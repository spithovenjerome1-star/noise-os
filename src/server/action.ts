import "server-only";
import { ZodError, type ZodSchema } from "zod";
import { Prisma } from "@prisma/client";
import { AuthError } from "./auth";

export type ActionResult<T = unknown> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Convert FormData into a plain object (multi-value keys become arrays). */
export function formToObject(fd: FormData) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v !== "string") continue;
    if (k in out) out[k] = ([] as unknown[]).concat(out[k], v);
    else out[k] = v;
  }
  return out;
}

export function parseWith<T>(schema: ZodSchema<T>, input: unknown): T {
  return schema.parse(input);
}

/** Wrap an action body: converts validation/auth/db errors into friendly results. */
export async function runAction<T>(fn: () => Promise<T | ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    const r = await fn();
    if (r && typeof r === "object" && "ok" in (r as object)) return r as ActionResult<T>;
    return { ok: true, data: r as T };
  } catch (e) {
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      return { ok: false, error: "Please check the highlighted fields.", fieldErrors };
    }
    if (e instanceof AuthError) return { ok: false, error: e.message };
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") return { ok: false, error: `That ${String((e.meta?.target as string[] | undefined)?.join(", ") ?? "value")} is already in use.` };
      if (e.code === "P2025") return { ok: false, error: "That record no longer exists." };
      if (e.code === "P2003") return { ok: false, error: "This record is linked to other records and can't be removed." };
    }
    if (e instanceof UserError) return { ok: false, error: e.message };
    // Next.js redirect()/notFound() must propagate
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    console.error(e);
    return { ok: false, error: "Something went wrong. Nothing was saved." };
  }
}

/** Throw for expected, user-facing failures. */
export class UserError extends Error {}
