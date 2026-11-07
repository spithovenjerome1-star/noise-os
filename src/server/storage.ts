import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

// Private local storage. Files are only served through /api/files/[id], which checks access.
// For production, swap this module for S3/R2/Supabase Storage with the same interface.
const ROOT = path.resolve(process.env.STORAGE_DIR || "./storage");

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const ALLOWED_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/svg+xml",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "font/ttf",
  "font/otf",
  "font/woff",
  "font/woff2",
];

function resolveKey(key: string) {
  if (!/^[a-z0-9/_.-]+$/i.test(key) || key.includes("..")) throw new Error("Invalid storage key");
  return path.join(ROOT, key);
}

export async function putFile(buf: Buffer, originalName: string) {
  const ext = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 10);
  const now = new Date();
  const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomBytes(16).toString("hex")}${ext}`;
  const full = resolveKey(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buf);
  return key;
}

export async function getFile(key: string) {
  return readFile(resolveKey(key));
}

export async function deleteFile(key: string) {
  try {
    await unlink(resolveKey(key));
  } catch {
    /* already gone */
  }
}
