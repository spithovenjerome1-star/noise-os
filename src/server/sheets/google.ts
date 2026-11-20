// Read-only Google Sheets access with a service account (no user OAuth, no extra dependency).
//
// Setup: create a service account in Google Cloud, enable the Google Sheets API, download its
// JSON key and put the whole JSON (or its base64) in GOOGLE_SERVICE_ACCOUNT_JSON. Then share
// each spreadsheet with the service account's email as Viewer. The scope is read-only, so the
// app cannot change the sheets even by mistake.
import { createSign } from "node:crypto";
import type { Tab } from "@/lib/domain/sheets";

const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://sheets.googleapis.com/v4/spreadsheets";

type ServiceAccount = { client_email: string; private_key: string };

export class SheetsError extends Error {}

export function serviceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  let text = raw;
  if (!raw.startsWith("{")) {
    try {
      text = Buffer.from(raw, "base64").toString("utf8");
    } catch {
      throw new SheetsError("GOOGLE_SERVICE_ACCOUNT_JSON is neither JSON nor base64 JSON.");
    }
  }
  try {
    const j = JSON.parse(text) as Partial<ServiceAccount>;
    if (!j.client_email || !j.private_key) throw new Error("missing fields");
    return { client_email: j.client_email, private_key: j.private_key.replace(/\\n/g, "\n") };
  } catch {
    throw new SheetsError("GOOGLE_SERVICE_ACCOUNT_JSON must be the service account's JSON key (with client_email and private_key).");
  }
}

/** The email the user shares their sheets with, or null when not configured. */
export function serviceAccountEmail(): string | null {
  try {
    return serviceAccount()?.client_email ?? null;
  } catch {
    return null;
  }
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

let cached: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.exp - 60 > Date.now() / 1000) return cached.token;
  const sa = serviceAccount();
  if (!sa) throw new SheetsError("Google Sheets isn't connected yet: set GOOGLE_SERVICE_ACCOUNT_JSON on the server.");
  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !body.access_token) throw new SheetsError(`Google sign-in failed: ${body.error_description ?? res.statusText}`);
  cached = { token: body.access_token, exp: iat + (body.expires_in ?? 3600) };
  return body.access_token;
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${await accessToken()}` }, signal: AbortSignal.timeout(30_000) });
  if (res.ok) return (await res.json()) as T;
  const email = serviceAccountEmail();
  if (res.status === 403)
    throw new SheetsError(`No access to this spreadsheet. Share it with ${email ?? "the service account"} as Viewer (and check the Google Sheets API is enabled).`);
  if (res.status === 404) throw new SheetsError("Spreadsheet not found. Check the link.");
  const text = await res.text().catch(() => "");
  throw new SheetsError(`Google Sheets error ${res.status}: ${text.slice(0, 200)}`);
}

const quoteTab = (title: string) => `'${title.replace(/'/g, "''")}'`;

/** All tabs of a spreadsheet as trimmed string grids (formatted values, as you see them in Sheets). */
export async function fetchSpreadsheet(spreadsheetId: string): Promise<{ title: string; tabs: Tab[] }> {
  const meta = await get<{ properties?: { title?: string }; sheets?: { properties?: { title?: string; sheetType?: string } }[] }>(
    `${API}/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties(title,sheetType)`,
  );
  const titles = (meta.sheets ?? []).filter((s) => (s.properties?.sheetType ?? "GRID") === "GRID").map((s) => s.properties?.title ?? "").filter(Boolean);
  if (!titles.length) return { title: meta.properties?.title ?? "", tabs: [] };
  const params = new URLSearchParams({ valueRenderOption: "FORMATTED_VALUE", majorDimension: "ROWS" });
  for (const t of titles) params.append("ranges", quoteTab(t));
  const data = await get<{ valueRanges?: { values?: unknown[][] }[] }>(`${API}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params}`);
  const tabs = titles.map((title, i) => ({
    title,
    rows: (data.valueRanges?.[i]?.values ?? []).map((row) => row.map((c) => (c === null || c === undefined ? "" : String(c).trim()))),
  }));
  return { title: meta.properties?.title ?? "", tabs };
}
