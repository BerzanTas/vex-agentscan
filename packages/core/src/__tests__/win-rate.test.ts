import { describe, expect, it } from "vitest";
import { winRate } from "../agent-metrics/realized-result.js";

const closedTrips = (closedRoundTrips: number, winningRoundTrips: number) => ({
  realizedUsd: "0",
  closedRoundTrips,
  winningRoundTrips,
  unmatchedDisposals: 0,
});

describe("winRate", () => {
  it("withholds a rate below the round-trip floor rather than reporting zero", () => {
    expect(winRate(closedTrips(4, 0), 5)).toBe(null);
    expect(winRate(closedTrips(4, 4), 5)).toBe(null);
  });

  it("reports a rate at exactly the round-trip floor", () => {
    expect(winRate(closedTrips(5, 3), 5)).toBe(0.6);
  });

  it("reports zero at the floor when no round trip won", () => {
    expect(winRate(closedTrips(5, 0), 5)).toBe(0);
  });

  it("reports one when every round trip above the floor won", () => {
    expect(winRate(closedTrips(8, 8), 5)).toBe(1);
  });

  it("withholds a rate when nothing closed at all", () => {
    expect(winRate(closedTrips(0, 0), 1)).toBe(null);
  });
});
