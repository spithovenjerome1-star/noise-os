/** URL-safe slug from a service name. */
export function slugify(input: string) {
  const s = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return s || "service";
}

/** Pick the first free slug: base, base-2, base-3… */
export function uniqueSlug(base: string, taken: Iterable<string>) {
  const set = new Set(taken);
  if (!set.has(base)) return base;
  for (let i = 2; i < 1000; i++) if (!set.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now()}`;
}

/** Sliding-window limiter: true if another request is allowed. Mutates `hits`. */
export function allowRequest(hits: number[], now: number, windowMs: number, max: number) {
  while (hits.length && hits[0]! <= now - windowMs) hits.shift();
  if (hits.length >= max) return false;
  hits.push(now);
  return true;
}

export function formatDuration(min: number | null | undefined) {
  if (!min) return null;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
