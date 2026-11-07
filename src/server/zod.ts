import { z } from "zod";
import { parseMoney, parsePercentToBp } from "@/lib/money";

// Shared form field schemas. Forms send strings; these coerce them safely.
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const zStr = (max = 500) => z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(max));
export const zReq = (label = "This field", max = 500) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string({ required_error: `${label} is required` }).min(1, `${label} is required`).max(max));
export const zOpt = (max = 5000) =>
  z.preprocess((v) => {
    const e = emptyToNull(v);
    return typeof e === "string" ? e.trim() : e;
  }, z.string().max(max).nullable().optional()).transform((v) => v ?? null);
export const zEmail = z.preprocess(emptyToNull, z.string().trim().email("Enter a valid email").nullable().optional()).transform((v) => v ?? null);
export const zDate = z.preprocess(emptyToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date").nullable().optional()).transform((v) => v ?? null);
export const zDateReq = (label = "Date") => z.string({ required_error: `${label} is required` }).regex(/^\d{4}-\d{2}-\d{2}$/, `${label} is required`);
export const zDateTime = z.preprocess(emptyToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Enter a valid date and time").nullable().optional()).transform((v) => v ?? null);
export const zMoney = z
  .preprocess(emptyToNull, z.union([z.string(), z.number()]).nullable().optional())
  .transform((v, ctx) => {
    if (v === null || v === undefined) return null;
    const c = parseMoney(v as string);
    if (c === null) {
      ctx.addIssue({ code: "custom", message: "Enter a valid amount" });
      return z.NEVER;
    }
    return c;
  });
export const zMoneyReq = (label = "Amount") =>
  zMoney.refine((v): v is number => v !== null, { message: `${label} is required` }).transform((v) => v as number);
export const zPercentBp = z
  .preprocess(emptyToNull, z.union([z.string(), z.number()]).nullable().optional())
  .transform((v, ctx) => {
    if (v === null || v === undefined) return null;
    const bp = parsePercentToBp(v as string);
    if (bp === null || bp < 0 || bp > 10000) {
      ctx.addIssue({ code: "custom", message: "Enter a percentage between 0 and 100" });
      return z.NEVER;
    }
    return bp;
  });
export const zInt = (min = 0, max = 100000) =>
  z.preprocess((v) => (emptyToNull(v) === null ? null : Number(v)), z.number().int().min(min).max(max).nullable().optional()).transform((v) => v ?? null);
export const zBool = z.preprocess((v) => v === "on" || v === "true" || v === true || v === "1", z.boolean());
export const zId = z.preprocess(emptyToNull, z.string().max(64).nullable().optional()).transform((v) => v ?? null);
