import { describe, expect, it } from "vitest";
import { legUsd, plainDecimalFrom } from "../pricing/decimal.js";
import { isPriceAcceptable } from "../pricing/acceptance.js";

describe("legUsd", () => {
  it("prices a whole 18-decimal token exactly", () => {
    expect(legUsd({ executedRaw: "1000000000000000000", decimals: 18, priceUsd: "2500.5" })).toBe("2500.5");
  });

  it("prices a fractional 18-decimal amount without float drift", () => {
    expect(legUsd({ executedRaw: "123456789012345678", decimals: 18, priceUsd: "0.1" })).toBe(
      "0.0123456789012345678",
    );
  });

  it("prices a 6-decimal token exactly", () => {
    expect(legUsd({ executedRaw: "1500000", decimals: 6, priceUsd: "0.999" })).toBe("1.4985");
  });

  it("keeps every significant digit of a large 18-decimal position", () => {
    expect(legUsd({ executedRaw: "3333333333333333333", decimals: 18, priceUsd: "3.3" })).toBe(
      "10.9999999999999999989",
    );
  });

  it("returns zero for a zero amount", () => {
    expect(legUsd({ executedRaw: "0", decimals: 18, priceUsd: "2500.5" })).toBe("0");
  });

  it("prices a zero-decimal token", () => {
    expect(legUsd({ executedRaw: "7", decimals: 0, priceUsd: "2" })).toBe("14");
  });

  it("rejects a raw amount that is not an integer string", () => {
    expect(legUsd({ executedRaw: "1.5", decimals: 18, priceUsd: "1" })).toBeNull();
  });

  it("rejects a price that is not a decimal string", () => {
    expect(legUsd({ executedRaw: "1", decimals: 0, priceUsd: "NaN" })).toBeNull();
  });

  it("rejects a negative decimals value", () => {
    expect(legUsd({ executedRaw: "1", decimals: -1, priceUsd: "1" })).toBeNull();
  });
});

describe("plainDecimalFrom", () => {
  it("passes through a plain decimal", () => {
    expect(plainDecimalFrom(2500.5)).toBe("2500.5");
  });

  it("expands a small exponential into plain decimal notation", () => {
    expect(plainDecimalFrom(1.2345e-7)).toBe("0.00000012345");
  });

  it("expands a large exponential into plain decimal notation", () => {
    expect(plainDecimalFrom(1e21)).toBe("1000000000000000000000");
  });

  it("rejects a non-finite value", () => {
    expect(plainDecimalFrom(Number.NaN)).toBeNull();
  });

  it("rejects a negative price", () => {
    expect(plainDecimalFrom(-1)).toBeNull();
  });
});

const gate = { minConfidence: 0.9, maxDriftSec: 3600 };
const anchorSecond = 1_770_000_000;

describe("isPriceAcceptable", () => {
  it("accepts a point at the confidence threshold", () => {
    expect(isPriceAcceptable({ priceUsd: "1", confidence: 0.9, atSecond: anchorSecond }, anchorSecond, gate)).toBe(
      true,
    );
  });

  it("rejects a point below the confidence threshold", () => {
    expect(
      isPriceAcceptable({ priceUsd: "1", confidence: 0.89, atSecond: anchorSecond }, anchorSecond, gate),
    ).toBe(false);
  });

  it("accepts a point exactly at the drift limit in either direction", () => {
    expect(
      isPriceAcceptable({ priceUsd: "1", confidence: 1, atSecond: anchorSecond + 3600 }, anchorSecond, gate),
    ).toBe(true);
    expect(
      isPriceAcceptable({ priceUsd: "1", confidence: 1, atSecond: anchorSecond - 3600 }, anchorSecond, gate),
    ).toBe(true);
  });

  it("rejects a point beyond the drift limit", () => {
    expect(
      isPriceAcceptable({ priceUsd: "1", confidence: 1, atSecond: anchorSecond + 3601 }, anchorSecond, gate),
    ).toBe(false);
  });
});
