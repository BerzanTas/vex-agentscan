import { describe, expect, it } from "vitest";
import type { ClaimedPricingRow } from "../repos/activity-pricing-repo.js";
import { pricedVolumeOf } from "../worker/pricing-loop.js";

function claimedRowWithRole(eventRole: string): ClaimedPricingRow {
  return {
    activityId: 1n,
    protocol: "kyberswap",
    kind: "swap",
    eventRole,
    chainFamily: "eip155",
    chainId: 8453n,
    priceHour: new Date("2026-08-04T10:00:00Z"),
    aggregateDay: "2026-08-04",
    settledAt: new Date("2026-08-04T10:41:00Z"),
    attempts: 0,
    executedInRaw: "1000000000000000000",
    tokenInAddress: "0x4200000000000000000000000000000000000006",
    tokenInDecimals: 18,
    usdInEst: null,
    executedOutRaw: "2495000000",
    tokenOutAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    tokenOutDecimals: 6,
    usdOutEst: null,
  };
}

describe("pricedVolumeOf", () => {
  it("books the IN leg when it carries a figure", () => {
    expect(pricedVolumeOf(claimedRowWithRole("swap"), "2500", "2495")).toBe("2500");
  });

  it("falls back to the OUT leg of a swap whose IN leg went unpriced", () => {
    expect(pricedVolumeOf(claimedRowWithRole("swap"), null, "2495")).toBe("2495");
  });

  it("books nothing for a lend withdrawal whatever its legs carry", () => {
    expect(pricedVolumeOf(claimedRowWithRole("lend_withdraw"), null, "2495")).toBe("0");
  });

  it("books nothing for a prediction sell whatever its legs carry", () => {
    expect(pricedVolumeOf(claimedRowWithRole("predict_sell"), null, "2495")).toBe("0");
  });

  it("books zero when neither leg carries a figure", () => {
    expect(pricedVolumeOf(claimedRowWithRole("swap"), null, null)).toBe("0");
  });
});
