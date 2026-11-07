import { describe, expect, it } from "vitest";
import { can, linkCanAccessClientResource, linkCanAccessScript, linkIsActive, type LinkLike } from "@/lib/permissions";

describe("role capabilities", () => {
  it("owner can do everything", () => {
    for (const c of ["finance:view", "finance:edit", "team:manage", "settings:manage", "data:export", "clients:delete"] as const) expect(can("OWNER", c)).toBe(true);
  });
  it("admin cannot manage team or hard-delete clients", () => {
    expect(can("ADMIN", "team:manage")).toBe(false);
    expect(can("ADMIN", "clients:delete")).toBe(false);
    expect(can("ADMIN", "finance:edit")).toBe(true);
  });
  it("team members never see money, settings or exports", () => {
    for (const c of ["finance:view", "finance:edit", "analytics:view", "settings:manage", "data:export", "data:import", "team:manage"] as const) expect(can("MEMBER", c)).toBe(false);
    expect(can("MEMBER", "production:edit")).toBe(true);
  });
  it("no role means no access", () => {
    expect(can(null, "clients:view")).toBe(false);
  });
});

describe("share links", () => {
  const now = new Date("2026-11-07T12:00:00Z");
  const portal: LinkLike = { scope: "CLIENT_PORTAL", clientId: "c1", scriptId: null, expiresAt: null, revokedAt: null };
  const scriptLink: LinkLike = { scope: "SCRIPT", clientId: "c1", scriptId: "s1", expiresAt: null, revokedAt: null };

  it("expired and revoked links are inactive", () => {
    expect(linkIsActive(portal, now)).toBe(true);
    expect(linkIsActive({ ...portal, expiresAt: new Date("2026-11-07T11:59:59Z") }, now)).toBe(false);
    expect(linkIsActive({ ...portal, expiresAt: new Date("2026-11-08T00:00:00Z") }, now)).toBe(true);
    expect(linkIsActive({ ...portal, revokedAt: new Date("2026-11-01T00:00:00Z") }, now)).toBe(false);
  });
  it("portal links only see their own client's resources", () => {
    expect(linkCanAccessClientResource(portal, { clientId: "c1" }, now)).toBe(true);
    expect(linkCanAccessClientResource(portal, { clientId: "c2" }, now)).toBe(false);
    expect(linkCanAccessScript(portal, { id: "sX", clientId: "c1" }, now)).toBe(true);
    expect(linkCanAccessScript(portal, { id: "sX", clientId: "c2" }, now)).toBe(false);
  });
  it("script links see exactly one script and nothing else", () => {
    expect(linkCanAccessScript(scriptLink, { id: "s1", clientId: "c1" }, now)).toBe(true);
    expect(linkCanAccessScript(scriptLink, { id: "s2", clientId: "c1" }, now)).toBe(false);
    expect(linkCanAccessClientResource(scriptLink, { clientId: "c1" }, now)).toBe(false);
  });
  it("a script link with a forged client id is denied", () => {
    expect(linkCanAccessScript({ ...scriptLink, clientId: "c2" }, { id: "s1", clientId: "c1" }, now)).toBe(false);
  });
});
