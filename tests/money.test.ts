import { describe, expect, it } from "vitest";
import { parseMoney, vatOnNet, splitGross, formatRateBp, parsePercentToBp, percentOf, centsToInput } from "@/lib/money";

describe("parseMoney", () => {
  it("parses plain and formatted amounts to integer cents", () => {
    expect(parseMoney("599")).toBe(59900);
    expect(parseMoney("599.5")).toBe(59950);
    expect(parseMoney("€1,234.56")).toBe(123456);
    expect(parseMoney(" EUR 10 ")).toBe(1000);
    expect(parseMoney(12.34)).toBe(1234);
  });
  it("handles European formats", () => {
    expect(parseMoney("1.234,56")).toBe(123456);
    expect(parseMoney("12,50")).toBe(1250);
    expect(parseMoney("1.000.000,00")).toBe(100000000);
  });
  it("rounds half-up on the third decimal without float drift", () => {
    expect(parseMoney("0.105")).toBe(11);
    expect(parseMoney("0.104")).toBe(10);
    expect(parseMoney("1.005")).toBe(101); // naive Math.round(1.005*100) gives 100
  });
  it("handles negatives, empty and garbage", () => {
    expect(parseMoney("-20.00")).toBe(-2000);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("1.2.3")).toBeNull();
  });
  it("round-trips through centsToInput", () => {
    expect(parseMoney(centsToInput(59999))).toBe(59999);
  });
});

describe("VAT helpers", () => {
  it("computes VAT on net with half-up rounding", () => {
    expect(vatOnNet(59900, 1800)).toBe(10782);
    expect(vatOnNet(1, 1800)).toBe(0); // 0.18c
    expect(vatOnNet(3, 1800)).toBe(1); // 0.54c → 1
    expect(vatOnNet(10000, 0)).toBe(0);
  });
  it("splits gross into net + VAT that always sum back", () => {
    expect(splitGross(11800, 1800)).toEqual({ netCents: 10000, vatCents: 1800 });
    for (const g of [1, 99, 1234, 99999, 70683]) {
      const s = splitGross(g, 1800);
      expect(s.netCents + s.vatCents).toBe(g);
    }
    expect(splitGross(5000, 0)).toEqual({ netCents: 5000, vatCents: 0 });
  });
  it("formats and parses rates in basis points", () => {
    expect(formatRateBp(1800)).toBe("18%");
    expect(formatRateBp(750)).toBe("7.50%");
    expect(parsePercentToBp("18")).toBe(1800);
    expect(parsePercentToBp("7,5%")).toBe(750);
    expect(percentOf(100000, 1500)).toBe(15000);
  });
});
