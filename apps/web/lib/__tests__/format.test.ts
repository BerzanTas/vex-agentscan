import { describe, expect, it } from "vitest";
import {
  formatAge,
  formatRawAmount,
  formatRawAmountDisplay,
  formatUsdCompact,
  formatUsdEstimate,
} from "../format";

describe("formatRawAmount", () => {
  it("formats a whole token amount without a fractional part", () => {
    expect(formatRawAmount("2410000000000000000000", 18)).toBe("2410");
  });

  it("trims trailing zeros from the fractional part", () => {
    expect(formatRawAmount("1500000", 6)).toBe("1.5");
  });
});

describe("formatRawAmountDisplay", () => {
  it("shows two fraction digits for amounts of a thousand and above", () => {
    expect(formatRawAmountDisplay("5353317647000000000000", 18)).toBe("5353.31");
  });

  it("shows four fraction digits for amounts between one and a thousand", () => {
    expect(formatRawAmountDisplay("680444444000000000000", 18)).toBe("680.4444");
    expect(formatRawAmountDisplay("2410490909090909090", 18)).toBe("2.4104");
  });

  it("keeps four significant fraction digits after leading zeros below one", () => {
    expect(formatRawAmountDisplay("677833000000000000", 18)).toBe("0.6778");
    expect(formatRawAmountDisplay("39815100000000000", 18)).toBe("0.03981");
    expect(formatRawAmountDisplay("12345678910000", 18)).toBe("0.00001234");
  });

  it("truncates without rounding up", () => {
    expect(formatRawAmountDisplay("1999999000000000000", 18)).toBe("1.9999");
  });

  it("leaves a whole amount unchanged", () => {
    expect(formatRawAmountDisplay("2410000000000000000000", 18)).toBe("2410");
  });

  it("trims trailing zeros left after the cut", () => {
    expect(formatRawAmountDisplay("1500000700000000000", 18)).toBe("1.5");
    expect(formatRawAmountDisplay("1500000", 6)).toBe("1.5");
  });
});

describe("formatUsdEstimate", () => {
  it("groups thousands and caps the fraction at two digits", () => {
    expect(formatUsdEstimate("1234567.891")).toBe("1,234,567.89");
  });

  it("always shows two fraction digits so a money column stays aligned", () => {
    expect(formatUsdEstimate("42")).toBe("42.00");
    expect(formatUsdEstimate("1139862.7")).toBe("1,139,862.70");
  });

  it("truncates without rounding up so an estimate never inflates", () => {
    expect(formatUsdEstimate("9.999")).toBe("9.99");
  });

  it("keeps the integer part of a high-scale numeric from the api", () => {
    expect(formatUsdEstimate("5888494.0000000000000000")).toBe("5,888,494.00");
  });
});

describe("formatUsdCompact", () => {
  it("shortens millions to one fraction digit", () => {
    expect(formatUsdCompact("321334950")).toBe("321.3M");
    expect(formatUsdCompact("5888494.0000000000000000")).toBe("5.9M");
  });

  it("shortens thousands from exactly one thousand up", () => {
    expect(formatUsdCompact("1000")).toBe("1K");
    expect(formatUsdCompact("48219")).toBe("48.2K");
  });

  it("falls back to the exact two-digit form below a thousand", () => {
    expect(formatUsdCompact("999.99")).toBe("999.99");
    expect(formatUsdCompact("931.4")).toBe("931.40");
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
