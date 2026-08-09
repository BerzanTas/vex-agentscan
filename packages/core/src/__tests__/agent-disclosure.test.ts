import { describe, expect, it } from "vitest";
import { activitiesPerDay30d } from "../agent-metrics/activity-cadence.js";
import { unpricedSharePct } from "../agent-metrics/unpriced-share.js";
import { activity, leg } from "./agent-activity-fixture.js";

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

const nowSeconds = Date.UTC(2026, 7, 9, 12, 30, 0) / 1000;

type SeenShape = {
  activityId: bigint;
  day: string;
  pricingState?: "pending" | "server_priced" | "unpriced";
};

function seen(shape: SeenShape) {
  return activity({
    activityId: shape.activityId,
    observedAtSeconds: Date.parse(`${shape.day}T09:00:00Z`) / 1000,
    pricingState: shape.pricingState ?? "server_priced",
    spent: leg(USDC, 6, "1000000000", "1000"),
    received: leg(WETH, 18, "1000000000000000000", "995"),
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
