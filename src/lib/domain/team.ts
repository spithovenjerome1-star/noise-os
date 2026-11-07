import type { Role } from "@prisma/client";

/** Guard: the business must always keep at least one active owner who can sign in. */
export function canChangeOwnerState(opts: {
  target: { role: Role; active: boolean };
  next: { role: Role; active: boolean };
  activeOwners: number;
}): { ok: true } | { ok: false; reason: string } {
  const wasActiveOwner = opts.target.role === "OWNER" && opts.target.active;
  const staysActiveOwner = opts.next.role === "OWNER" && opts.next.active;
  if (wasActiveOwner && !staysActiveOwner && opts.activeOwners <= 1)
    return { ok: false, reason: "NOISE OS needs at least one active owner. Make someone else an owner first." };
  return { ok: true };
}
