import { describe, expect, it } from "vitest";
import { chainBreakdown, protocolBreakdown } from "../agent-metrics/breakdowns.js";
import { activity, leg } from "./agent-activity-fixture.js";

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

type BreakdownShape = {
  activityId: bigint;
  protocol: string;
  usd: string | null;
  chainFamily?: "eip155" | "solana";
  chainId?: bigint;
  eventRole?: string;
  pricingState?: "pending" | "server_priced" | "unpriced";
};

function traded(shape: BreakdownShape) {
  return activity({
    activityId: shape.activityId,
    observedAtSeconds: 1_770_000_000,
    protocol: shape.protocol,
    chainFamily: shape.chainFamily ?? "eip155",
    chainId: shape.chainId ?? 8453n,
    eventRole: shape.eventRole ?? "swap",
    pricingState: shape.pricingState ?? "server_priced",
    spent: leg(USDC, 6, "1000000000", shape.usd),
    received: leg(WETH, 18, "1000000000000000000", shape.usd),
  });
}

describe("protocolBreakdown", () => {
  it("sums priced volume and counts every activity per protocol, heaviest first", () => {
    const activities = [
      traded({ activityId: 1n, protocol: "kyberswap", usd: "120.5" }),
      traded({ activityId: 2n, protocol: "kyberswap", usd: "80" }),
      traded({ activityId: 3n, protocol: "relay", usd: "300" }),
    ];

    expect(protocolBreakdown(activities)).toEqual([
      { protocol: "relay", volumeUsd: "300", txCount: 1 },
      { protocol: "kyberswap", volumeUsd: "200.5", txCount: 2 },
    ]);
  });

  it("counts an unpriced activity without adding it to the volume", () => {
    const activities = [
      traded({ activityId: 1n, protocol: "kyberswap", usd: "40" }),
      traded({ activityId: 2n, protocol: "kyberswap", usd: null, pricingState: "unpriced" }),
      traded({ activityId: 3n, protocol: "khalani", usd: null, pricingState: "pending" }),
    ];

    expect(protocolBreakdown(activities)).toEqual([
      { protocol: "kyberswap", volumeUsd: "40", txCount: 2 },
      { protocol: "khalani", volumeUsd: "0", txCount: 1 },
    ]);
  });

  it("counts a priced non-deploying role without adding it to the volume", () => {
    const activities = [
      traded({ activityId: 1n, protocol: "relay", usd: "70", eventRole: "swap" }),
      traded({ activityId: 2n, protocol: "relay", usd: "30", eventRole: "bridge_deposit" }),
      traded({ activityId: 3n, protocol: "relay", usd: "900", eventRole: "bridge_fill_observed" }),
      traded({ activityId: 4n, protocol: "relay", usd: "800", eventRole: "bridge_refund" }),
      traded({ activityId: 5n, protocol: "relay", usd: "700", eventRole: "token_launch" }),
    ];

    expect(protocolBreakdown(activities)).toEqual([
      { protocol: "relay", volumeUsd: "100", txCount: 5 },
    ]);
  });

  it("orders protocols of equal volume by name", () => {
    const activities = [
      traded({ activityId: 1n, protocol: "relay", usd: "10" }),
      traded({ activityId: 2n, protocol: "khalani", usd: "10" }),
    ];

    expect(protocolBreakdown(activities).map((entry) => entry.protocol)).toEqual(["khalani", "relay"]);
  });
});

describe("chainBreakdown", () => {
  it("sums priced volume and counts every activity per chain, heaviest first", () => {
    const activities = [
      traded({ activityId: 1n, protocol: "kyberswap", chainId: 8453n, usd: "120" }),
      traded({ activityId: 2n, protocol: "kyberswap", chainId: 42161n, usd: "500" }),
      traded({ activityId: 3n, protocol: "relay", chainId: 42161n, usd: "5" }),
    ];

    expect(chainBreakdown(activities)).toEqual([
      {
        chainFamily: "eip155",
        chainId: 42161n,
        protocols: ["kyberswap", "relay"],
        volumeUsd: "505",
        txCount: 2,
      },
      {
        chainFamily: "eip155",
        chainId: 8453n,
        protocols: ["kyberswap"],
        volumeUsd: "120",
        txCount: 1,
      },
    ]);
  });

  it("keeps a priced non-deploying role out of the chain volume but inside its count", () => {
    const activities = [
      traded({ activityId: 1n, protocol: "relay", chainId: 8453n, usd: "40", eventRole: "swap" }),
      traded({
        activityId: 2n,
        protocol: "relay",
        chainId: 8453n,
        usd: "900",
        eventRole: "bridge_refund",
      }),
    ];

    expect(chainBreakdown(activities)).toEqual([
      {
        chainFamily: "eip155",
        chainId: 8453n,
        protocols: ["relay"],
        volumeUsd: "40",
        txCount: 2,
      },
    ]);
  });

  it("keeps the same chain id on two families apart", () => {
    const activities = [
      traded({ activityId: 1n, protocol: "relay", chainFamily: "eip155", chainId: 792703809n, usd: "10" }),
      traded({ activityId: 2n, protocol: "relay", chainFamily: "solana", chainId: 792703809n, usd: "40" }),
    ];

    expect(chainBreakdown(activities).map((entry) => entry.chainFamily)).toEqual(["solana", "eip155"]);
  });
});
