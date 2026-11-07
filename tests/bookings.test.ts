import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug, allowRequest, formatDuration } from "@/lib/domain/bookings";

describe("slugify", () => {
  it("normalizes names", () => {
    expect(slugify("Social Media Reels & Shorts")).toBe("social-media-reels-and-shorts");
    expect(slugify("  Événement   Coverage!! ")).toBe("evenement-coverage");
    expect(slugify("***")).toBe("service");
  });
  it("uniqueSlug appends counters", () => {
    expect(uniqueSlug("reels", [])).toBe("reels");
    expect(uniqueSlug("reels", ["reels", "reels-2"])).toBe("reels-3");
  });
});

describe("allowRequest", () => {
  it("limits within a window and frees up after", () => {
    const hits: number[] = [];
    expect(allowRequest(hits, 0, 1000, 2)).toBe(true);
    expect(allowRequest(hits, 10, 1000, 2)).toBe(true);
    expect(allowRequest(hits, 20, 1000, 2)).toBe(false);
    expect(allowRequest(hits, 1001, 1000, 2)).toBe(true);
  });
});

describe("formatDuration", () => {
  it("formats minutes", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(120)).toBe("2 h");
    expect(formatDuration(90)).toBe("1 h 30 min");
    expect(formatDuration(null)).toBe(null);
  });
});
