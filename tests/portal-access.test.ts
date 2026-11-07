import { describe, it, expect } from "vitest";
import { linkIsActive, linkCanAccessScript, linkCanAccessClientResource, type LinkLike } from "@/lib/permissions";

const now = new Date("2026-11-07T12:00:00Z");
const portal: LinkLike = { scope: "CLIENT_PORTAL", clientId: "c1", scriptId: null, expiresAt: null, revokedAt: null };
const scriptLink: LinkLike = { scope: "SCRIPT", clientId: "c1", scriptId: "s1", expiresAt: null, revokedAt: null };

describe("linkIsActive", () => {
  it("active without expiry", () => expect(linkIsActive(portal, now)).toBe(true));
  it("revoked links are inactive", () => expect(linkIsActive({ ...portal, revokedAt: new Date("2026-11-01") }, now)).toBe(false));
  it("expired links are inactive", () => expect(linkIsActive({ ...portal, expiresAt: new Date("2026-11-07T11:59:59Z") }, now)).toBe(false));
  it("expiry exactly now is inactive", () => expect(linkIsActive({ ...portal, expiresAt: now }, now)).toBe(false));
  it("future expiry is active", () => expect(linkIsActive({ ...portal, expiresAt: new Date("2026-12-01") }, now)).toBe(true));
});

describe("script access", () => {
  it("portal link sees own client's scripts", () => expect(linkCanAccessScript(portal, { id: "s9", clientId: "c1" }, now)).toBe(true));
  it("portal link cannot see another client's script", () => expect(linkCanAccessScript(portal, { id: "s9", clientId: "c2" }, now)).toBe(false));
  it("script link sees only its script", () => {
    expect(linkCanAccessScript(scriptLink, { id: "s1", clientId: "c1" }, now)).toBe(true);
    expect(linkCanAccessScript(scriptLink, { id: "s2", clientId: "c1" }, now)).toBe(false);
  });
  it("script link with mismatched client is denied", () => expect(linkCanAccessScript(scriptLink, { id: "s1", clientId: "c2" }, now)).toBe(false));
  it("revoked script link denied", () => expect(linkCanAccessScript({ ...scriptLink, revokedAt: now }, { id: "s1", clientId: "c1" }, now)).toBe(false));
});

describe("client resource access", () => {
  it("portal link sees own client's resources", () => expect(linkCanAccessClientResource(portal, { clientId: "c1" }, now)).toBe(true));
  it("cross-client denied", () => expect(linkCanAccessClientResource(portal, { clientId: "c2" }, now)).toBe(false));
  it("script-scoped link cannot see other client resources (videos, invoices)", () =>
    expect(linkCanAccessClientResource(scriptLink, { clientId: "c1" }, now)).toBe(false));
  it("expired portal denied", () => expect(linkCanAccessClientResource({ ...portal, expiresAt: new Date("2026-01-01") }, { clientId: "c1" }, now)).toBe(false));
});
