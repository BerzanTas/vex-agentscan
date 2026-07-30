import { describe, expect, it } from "vitest";
import { formatAge, formatRawAmount, formatUsdEstimate } from "../format";

describe("formatRawAmount", () => {
  it("formats a whole token amount without a fractional part", () => {
    expect(formatRawAmount("2410000000000000000000", 18)).toBe("2410");
  });

  it("trims trailing zeros from the fractional part", () => {
    expect(formatRawAmount("1500000", 6)).toBe("1.5");
  });
});

describe("formatUsdEstimate", () => {
  it("groups thousands and caps the fraction at two digits", () => {
    expect(formatUsdEstimate("1234567.891")).toBe("1,234,567.89");
  });

  it("leaves small whole values untouched", () => {
    expect(formatUsdEstimate("42")).toBe("42");
  });
});

describe("formatAge", () => {
  it("renders seconds below a minute", () => {
    expect(formatAge(42)).toBe("42s");
  });

  it("renders minutes below an hour", () => {
    expect(formatAge(300)).toBe("5m");
  });

  it("renders hours below a day", () => {
    expect(formatAge(7200)).toBe("2h");
  });

  it("renders days from a day up", () => {
    expect(formatAge(180000)).toBe("2d");
  });
});
