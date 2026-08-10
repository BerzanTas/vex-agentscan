import { describe, expect, it } from "vitest";
import { publishedUsd } from "../agent-metrics/published-usd.js";

describe("publishedUsd", () => {
  it("drops the sub-cent digits that would fingerprint a single transaction", () => {
    expect(publishedUsd("1013.478912345678901234")).toBe("1013.48");
  });

  it("leaves a value already at cent resolution untouched", () => {
    expect(publishedUsd("1013.48")).toBe("1013.48");
  });

  it("rounds a half cent away from zero in both directions", () => {
    expect(publishedUsd("0.005")).toBe("0.01");
    expect(publishedUsd("-0.005")).toBe("-0.01");
  });

  it("keeps a whole dollar amount free of trailing zeros", () => {
    expect(publishedUsd("1250")).toBe("1250");
    expect(publishedUsd("1250.000000000000000001")).toBe("1250");
  });

  it("reports a loss to the cent", () => {
    expect(publishedUsd("-0.000000999999995")).toBe("0");
    expect(publishedUsd("-12.3456")).toBe("-12.35");
  });

  it("preserves an amount far beyond double precision", () => {
    expect(publishedUsd("123456789012345678.994")).toBe("123456789012345678.99");
  });
});
