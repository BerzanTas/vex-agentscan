import { describe, expect, it } from "vitest";
import { capitalDeployed } from "../agent-metrics/capital-deployed.js";
import { activity, leg } from "./agent-activity-fixture.js";

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

const nowSeconds = Date.UTC(2026, 7, 9, 12, 30, 0) / 1000;

type DeployedShape = {
  activityId: bigint;
  day: string;
  usd: string | null;
  eventRole?: string;
  pricingState?: "pending" | "server_priced" | "unpriced";
};

function deployed(shape: DeployedShape) {
  return activity({
    activityId: shape.activityId,
    observedAtSeconds: Date.parse(`${shape.day}T09:00:00Z`) / 1000,
    eventRole: shape.eventRole ?? "swap",
    pricingState: shape.pricingState ?? "server_priced",
    spent: leg(USDC, 6, "1000000000", shape.usd),
    received: leg(WETH, 18, "1000000000000000000", shape.usd),
  });
}

describe("capitalDeployed", () => {
  it("zero-fills the trailing thirty UTC days oldest first", () => {
    const { daily } = capitalDeployed([deployed({ activityId: 1n, day: "2026-08-05", usd: "250" })], nowSeconds);

    expect(daily).toHaveLength(30);
    expect(daily[0]).toEqual({ day: "2026-07-11", usd: "0" });
    expect(daily[29]).toEqual({ day: "2026-08-09", usd: "0" });
    expect(daily.filter((point) => point.usd !== "0")).toEqual([{ day: "2026-08-05", usd: "250" }]);
  });

  it("sums every deployed row that falls on the same UTC day", () => {
    const { daily } = capitalDeployed(
      [
        deployed({ activityId: 1n, day: "2026-08-05", usd: "250.5" }),
        deployed({ activityId: 2n, day: "2026-08-05", usd: "19.25" }),
      ],
      nowSeconds,
    );

    expect(daily.filter((point) => point.usd !== "0")).toEqual([{ day: "2026-08-05", usd: "269.75" }]);
  });

  it("reports the largest single day inside the window as the peak", () => {
    const { peakUsd } = capitalDeployed(
      [
        deployed({ activityId: 1n, day: "2026-07-20", usd: "400" }),
        deployed({ activityId: 2n, day: "2026-08-01", usd: "900" }),
        deployed({ activityId: 3n, day: "2026-08-08", usd: "150" }),
      ],
      nowSeconds,
    );

    expect(peakUsd).toBe("900");
  });

  it("ignores the day before the window opens", () => {
    const result = capitalDeployed(
      [
        deployed({ activityId: 1n, day: "2026-07-10", usd: "5000" }),
        deployed({ activityId: 2n, day: "2026-07-11", usd: "70" }),
      ],
      nowSeconds,
    );

    expect(result.peakUsd).toBe("70");
    expect(result.daily.filter((point) => point.usd !== "0")).toEqual([{ day: "2026-07-11", usd: "70" }]);
  });

  it("counts swap and bridge deposit legs and nothing else", () => {
    const result = capitalDeployed(
      [
        deployed({ activityId: 1n, day: "2026-08-02", usd: "100", eventRole: "swap" }),
        deployed({ activityId: 2n, day: "2026-08-02", usd: "60", eventRole: "bridge_deposit" }),
        deployed({ activityId: 3n, day: "2026-08-02", usd: "999", eventRole: "bridge_fill_observed" }),
        deployed({ activityId: 4n, day: "2026-08-02", usd: "888", eventRole: "bridge_refund" }),
      ],
      nowSeconds,
    );

    expect(result.peakUsd).toBe("160");
  });

  it("counts only rows the pricing lane settled as server priced", () => {
    const result = capitalDeployed(
      [
        deployed({ activityId: 1n, day: "2026-08-02", usd: "100" }),
        deployed({ activityId: 2n, day: "2026-08-02", usd: null, pricingState: "unpriced" }),
        deployed({ activityId: 3n, day: "2026-08-02", usd: null, pricingState: "pending" }),
      ],
      nowSeconds,
    );

    expect(result.peakUsd).toBe("100");
  });

  it("reports a zero peak when no row is priced", () => {
    const result = capitalDeployed(
      [deployed({ activityId: 1n, day: "2026-08-02", usd: null, pricingState: "unpriced" })],
      nowSeconds,
    );

    expect(result.peakUsd).toBe("0");
    expect(result.daily.filter((point) => point.usd !== "0")).toEqual([]);
  });
});
