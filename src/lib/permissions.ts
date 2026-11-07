import type { Role } from "@prisma/client";

export type Capability =
  | "clients:view"
  | "clients:edit"
  | "production:edit"
  | "finance:view"
  | "finance:edit"
  | "analytics:view"
  | "settings:manage"
  | "team:manage"
  | "data:export"
  | "data:import"
  | "clients:delete";

const MATRIX: Record<Role, Capability[]> = {
  OWNER: [
    "clients:view", "clients:edit", "clients:delete", "production:edit", "finance:view", "finance:edit",
    "analytics:view", "settings:manage", "team:manage", "data:export", "data:import",
  ],
  ADMIN: [
    "clients:view", "clients:edit", "production:edit", "finance:view", "finance:edit",
    "analytics:view", "settings:manage", "data:export", "data:import",
  ],
  // Editors / crew: production work only. No money, no settings, no exports.
  MEMBER: ["clients:view", "production:edit"],
};

export function can(role: Role | null | undefined, cap: Capability) {
  if (!role) return false;
  return MATRIX[role].includes(cap);
}

export function capabilitiesOf(role: Role) {
  return [...MATRIX[role]];
}

/** Share-link validation. Pure so it can be unit tested. */
export type LinkLike = {
  scope: "CLIENT_PORTAL" | "SCRIPT";
  clientId: string;
  scriptId: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

export function linkIsActive(link: LinkLike, now = new Date()) {
  if (link.revokedAt) return false;
  if (link.expiresAt && link.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

/** Can this link see a given script? Portal links see all of their client's shared scripts; script links see one script. */
export function linkCanAccessScript(link: LinkLike, script: { id: string; clientId: string }, now = new Date()) {
  if (!linkIsActive(link, now)) return false;
  if (script.clientId !== link.clientId) return false;
  if (link.scope === "SCRIPT") return link.scriptId === script.id;
  return true;
}

export function linkCanAccessClientResource(link: LinkLike, resource: { clientId: string }, now = new Date()) {
  if (!linkIsActive(link, now)) return false;
  return link.scope === "CLIENT_PORTAL" && resource.clientId === link.clientId;
}
