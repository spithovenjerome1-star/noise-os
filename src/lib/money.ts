// All money is integer cents (EUR). These helpers are the only place where
// conversion between human input and cents happens.

const eur = new Intl.NumberFormat("en-MT", { style: "currency", currency: "EUR" });
const eurCompact = new Intl.NumberFormat("en-MT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export function formatMoney(cents: number | null | undefined, opts?: { compact?: boolean }) {
  if (cents === null || cents === undefined) return "—";
  const value = cents / 100;
  if (opts?.compact && Math.abs(value) >= 1000) return eurCompact.format(Math.round(value));
  return eur.format(value);
}

/**
 * Parse user input like "1,234.50", "€599", "599" into integer cents.
 * Returns null for empty input and NaN-like garbage.
 */
export function parseMoney(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input * 100) : null;
  let s = input.trim().replace(/[€\s]/g, "").replace(/^EUR/i, "");
  if (!s) return null;
  // European format "1.234,56" → "1234.56"
  if (/^-?\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  // Plain comma decimal "12,50"
  else if (/^-?\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const negative = s.startsWith("-");
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const fracPadded = (frac + "000").slice(0, 3);
  let cents = parseInt(whole, 10) * 100 + parseInt(fracPadded.slice(0, 2), 10);
  if (parseInt(fracPadded[2], 10) >= 5) cents += 1; // half-up on the 3rd decimal
  return negative ? -cents : cents;
}

export function centsToInput(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2);
}

/** Round half away from zero — used for VAT computation on integer cents. */
export function roundHalfUp(n: number) {
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

/** VAT on a net amount. rateBp: 1800 = 18%. */
export function vatOnNet(netCents: number, rateBp: number) {
  return roundHalfUp((netCents * rateBp) / 10000);
}

/** Split a gross (VAT-inclusive) amount into net + VAT. */
export function splitGross(grossCents: number, rateBp: number) {
  const net = roundHalfUp((grossCents * 10000) / (10000 + rateBp));
  return { netCents: net, vatCents: grossCents - net };
}

export function percentOf(cents: number, bp: number) {
  return roundHalfUp((cents * bp) / 10000);
}

export function formatRateBp(bp: number) {
  const pct = bp / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
}

export function parsePercentToBp(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined || input === "") return null;
  const n = typeof input === "number" ? input : parseFloat(String(input).replace("%", "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
