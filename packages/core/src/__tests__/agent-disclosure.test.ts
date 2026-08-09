import { describe, expect, it } from "vitest";
import { activitiesPerDay30d } from "../agent-metrics/activity-cadence.js";
import { unpriced30dSharePct, unpricedSharePct } from "../agent-metrics/unpriced-share.js";
import { absentLeg, activity, leg } from "./agent-activity-fixture.js";

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

const nowSeconds = Date.UTC(2026, 7, 9, 12, 30, 0) / 1000;

type SeenShape = {
  activityId: bigint;
  day: string;
  pricingState?: "pending" | "server_priced" | "unpriced";
  eventRole?: string;
  spentUsd?: string | null;
  receivedUsd?: string | null;
  receivedToken?: string | null;
};

function seen(shape: SeenShape) {
  const receivedToken = shape.receivedToken === undefined ? WETH : shape.receivedToken;
  return activity({
    activityId: shape.activityId,
    observedAtSeconds: Date.parse(`${shape.day}T09:00:00Z`) / 1000,
    pricingState: shape.pricingState ?? "server_priced",
    eventRole: shape.eventRole ?? "swap",
    spent: leg(USDC, 6, "1000000000", shape.spentUsd === undefined ? "1000" : shape.spentUsd),
    received:
      receivedToken === null
        ? absentLeg
        : leg(
            receivedToken,
            18,
            "1000000000000000000",
            shape.receivedUsd === undefined ? "995" : shape.receivedUsd,
          ),
  });
}

const days = ["2026-08-01", "2026-08-02", "2026-08-03"];

describe("activitiesPerDay30d", () => {
  it("divides the trailing thirty days of activity by thirty at two decimals", () => {
    const activities = days.map((day, index) => seen({ activityId: BigInt(index), day }));

    expect(activitiesPerDay30d(activities, nowSeconds)).toBe(0.1);
  });

  it("rounds to two decimals rather than reporting a repeating fraction", () => {
    const activities = [seen({ activityId: 1n, day: "2026-08-01" })];

    expect(activitiesPerDay30d(activities, nowSeconds)).toBe(0.03);
  });

  it("excludes activity older than the window", () => {
    const activities = [
      seen({ activityId: 1n, day: "2026-07-10" }),
      seen({ activityId: 2n, day: "2026-07-11" }),
    ];

    expect(activitiesPerDay30d(activities, nowSeconds)).toBe(0.03);
  });

  it("counts unpriced activity, which happened even though it has no USD figure", () => {
    const activities = [
      seen({ activityId: 1n, day: "2026-08-01", pricingState: "unpriced" }),
      seen({ activityId: 2n, day: "2026-08-02", pricingState: "pending" }),
      seen({ activityId: 3n, day: "2026-08-03" }),
    ];

    expect(activitiesPerDay30d(activities, nowSeconds)).toBe(0.1);
  });

  it("reports zero when nothing falls inside the window", () => {
    expect(activitiesPerDay30d([], nowSeconds)).toBe(0);
  });
});

describe("unpricedSharePct", () => {
  it("reports the share of settled rows the lane could not price", () => {
    const activities = [
      seen({ activityId: 1n, day: "2026-08-01" }),
      seen({ activityId: 2n, day: "2026-08-02" }),
      seen({ activityId: 3n, day: "2026-08-03", pricingState: "unpriced" }),
      seen({ activityId: 4n, day: "2026-08-04", pricingState: "unpriced" }),
    ];

    expect(unpricedSharePct(activities)).toBe(50);
  });

  it("excludes rows still pending, which are not yet a verdict", () => {
    const activities = [
      seen({ activityId: 1n, day: "2026-08-01" }),
      seen({ activityId: 2n, day: "2026-08-02", pricingState: "unpriced" }),
      seen({ activityId: 3n, day: "2026-08-03", pricingState: "pending" }),
      seen({ activityId: 4n, day: "2026-08-04", pricingState: "pending" }),
    ];

    expect(unpricedSharePct(activities)).toBe(50);
  });

  it("counts a priced row whose spent leg carries no value as one it could not price", () => {
    const activities = [seen({ activityId: 1n, day: "2026-08-02", spentUsd: null })];

    expect(unpricedSharePct(activities)).toBe(100);
  });

  it("counts a priced row whose declared received leg carries no value as one it could not price", () => {
    const activities = [seen({ activityId: 1n, day: "2026-08-02", receivedUsd: null })];

    expect(unpricedSharePct(activities)).toBe(100);
  });

  it("counts a row that declares no received leg as priced, since no leg went unpriced", () => {
    const activities = [seen({ activityId: 1n, day: "2026-08-02", receivedToken: null })];

    expect(unpricedSharePct(activities)).toBe(0);
  });

  it("measures only the roles that can carry a USD figure on the page", () => {
    const activities = [
      seen({ activityId: 1n, day: "2026-08-01", eventRole: "bridge_fill_observed" }),
      seen({ activityId: 2n, day: "2026-08-01", eventRole: "bridge_fill_observed" }),
      seen({ activityId: 3n, day: "2026-08-01", eventRole: "bridge_fill_observed" }),
      seen({ activityId: 4n, day: "2026-08-01", eventRole: "bridge_fill_observed" }),
      seen({ activityId: 5n, day: "2026-08-02", pricingState: "unpriced" }),
    ];

    expect(unpricedSharePct(activities)).toBe(100);
  });

  it("keeps a bridge deposit in the population it shares with the deployed figures", () => {
    const activities = [
      seen({ activityId: 1n, day: "2026-08-01", eventRole: "bridge_deposit" }),
      seen({ activityId: 2n, day: "2026-08-02", eventRole: "bridge_deposit", pricingState: "unpriced" }),
    ];

    expect(unpricedSharePct(activities)).toBe(50);
  });

  it("rounds the share to one decimal", () => {
    const activities = [
      seen({ activityId: 1n, day: "2026-08-01", pricingState: "unpriced" }),
      seen({ activityId: 2n, day: "2026-08-02" }),
      seen({ activityId: 3n, day: "2026-08-03" }),
    ];

    expect(unpricedSharePct(activities)).toBe(33.3);
  });

  it("reports zero when no row has reached a pricing verdict", () => {
    const activities = [seen({ activityId: 1n, day: "2026-08-01", pricingState: "pending" })];

    expect(unpricedSharePct(activities)).toBe(0);
  });

  it("spans the whole read set rather than the trailing thirty days", () => {
    const activities = [
      seen({ activityId: 1n, day: "2026-01-05", pricingState: "unpriced" }),
      seen({ activityId: 2n, day: "2026-08-02" }),
    ];

    expect(unpricedSharePct(activities)).toBe(50);
  });
});

describe("unpriced30dSharePct", () => {
  it("reports a recent coverage break that the lifetime share dilutes away", () => {
    const longPricedHistory = Array.from({ length: 48 }, (_unused, index) =>
      seen({ activityId: BigInt(index), day: "2026-01-05" }),
    );
    const recentBreak = [
      seen({ activityId: 100n, day: "2026-08-02", pricingState: "unpriced" }),
      seen({ activityId: 101n, day: "2026-08-03", pricingState: "unpriced" }),
      seen({ activityId: 102n, day: "2026-08-04", pricingState: "unpriced" }),
      seen({ activityId: 103n, day: "2026-08-05" }),
    ];
    const activities = [...longPricedHistory, ...recentBreak];

    expect(unpricedSharePct(activities)).toBe(5.8);
    expect(unpriced30dSharePct(activities, nowSeconds)).toBe(75);
  });

  it("excludes rows still pending inside the window", () => {
    const activities = [
      seen({ activityId: 1n, day: "2026-08-01", pricingState: "unpriced" }),
      seen({ activityId: 2n, day: "2026-08-02" }),
      seen({ activityId: 3n, day: "2026-08-03", pricingState: "pending" }),
    ];

    expect(unpriced30dSharePct(activities, nowSeconds)).toBe(50);
  });

  it("reports zero when the window holds nothing", () => {
    const activities = [seen({ activityId: 1n, day: "2026-01-05", pricingState: "unpriced" })];

    expect(unpriced30dSharePct(activities, nowSeconds)).toBe(0);
  });

  it("measures the same population the whole-set share does", () => {
    const activities = [
      seen({ activityId: 1n, day: "2026-08-01", eventRole: "bridge_fill_observed" }),
      seen({ activityId: 2n, day: "2026-08-01", eventRole: "bridge_fill_observed" }),
      seen({ activityId: 3n, day: "2026-08-02", receivedUsd: null }),
    ];

    expect(unpriced30dSharePct(activities, nowSeconds)).toBe(100);
  });
});
