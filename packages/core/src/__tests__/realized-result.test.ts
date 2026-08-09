import { describe, expect, it } from "vitest";
import { realizedResult } from "../agent-metrics/realized-result.js";
import { absentLeg, activity, leg } from "./agent-activity-fixture.js";

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const ARB = "0x912ce59144191c1204e64559fe8253a0e49e6548";

const oneWeth = "1000000000000000000";
const twoWeth = "2000000000000000000";
const threeWeth = "3000000000000000000";

describe("realizedResult", () => {
  it("realizes proceeds minus acquisition cost when a position closes", () => {
    const buy = activity({
      activityId: 1n,
      observedAtSeconds: 1000,
      spent: leg(USDC, 6, "1000000000", "1000"),
      received: leg(WETH, 18, oneWeth, "995"),
    });
    const sell = activity({
      activityId: 2n,
      observedAtSeconds: 2000,
      spent: leg(WETH, 18, oneWeth, "1100"),
      received: leg(USDC, 6, "1095000000", "1095"),
    });

    expect(realizedResult([buy, sell])).toEqual({
      realizedUsd: "105",
      closedRoundTrips: 1,
      winningRoundTrips: 1,
      unmatchedDisposals: 1,
    });
  });

  it("splits one acquisition proportionally across two disposals", () => {
    const buy = activity({
      activityId: 1n,
      observedAtSeconds: 1000,
      spent: leg(USDC, 6, "2000000000", "2000"),
      received: leg(WETH, 18, twoWeth, "2000"),
    });
    const firstSell = activity({
      activityId: 2n,
      observedAtSeconds: 2000,
      spent: leg(WETH, 18, oneWeth, "1200"),
      received: leg(USDC, 6, "1200000000", "1200"),
    });
    const secondSell = activity({
      activityId: 3n,
      observedAtSeconds: 3000,
      spent: leg(WETH, 18, oneWeth, "900"),
      received: leg(USDC, 6, "900000000", "900"),
    });

    expect(realizedResult([buy, firstSell, secondSell])).toEqual({
      realizedUsd: "100",
      closedRoundTrips: 2,
      winningRoundTrips: 1,
      unmatchedDisposals: 1,
    });
  });

  it("counts a disposal with an empty queue as unmatched and realizes nothing", () => {
    const sell = activity({
      activityId: 1n,
      observedAtSeconds: 1000,
      spent: leg(WETH, 18, oneWeth, "1100"),
      received: leg(USDC, 6, "1100000000", "1100"),
    });

    expect(realizedResult([sell])).toEqual({
      realizedUsd: "0",
      closedRoundTrips: 0,
      winningRoundTrips: 0,
      unmatchedDisposals: 1,
    });
  });

  it("carries unmatched inventory at cost instead of realizing it", () => {
    const buy = activity({
      activityId: 1n,
      observedAtSeconds: 1000,
      spent: leg(USDC, 6, "2000000000", "2000"),
      received: leg(WETH, 18, twoWeth, "2000"),
    });
    const partialSell = activity({
      activityId: 2n,
      observedAtSeconds: 2000,
      spent: leg(WETH, 18, oneWeth, "1300"),
      received: leg(USDC, 6, "1300000000", "1300"),
    });

    expect(realizedResult([buy, partialSell])).toEqual({
      realizedUsd: "300",
      closedRoundTrips: 1,
      winningRoundTrips: 1,
      unmatchedDisposals: 1,
    });
  });

  it("books only the matched share of proceeds when a disposal exceeds the queue", () => {
    const buy = activity({
      activityId: 1n,
      observedAtSeconds: 1000,
      spent: leg(USDC, 6, "1000000000", "1000"),
      received: leg(WETH, 18, oneWeth, "1000"),
    });
    const oversizedSell = activity({
      activityId: 2n,
      observedAtSeconds: 2000,
      spent: leg(WETH, 18, threeWeth, "3600"),
      received: leg(USDC, 6, "3600000000", "3600"),
    });

    expect(realizedResult([buy, oversizedSell])).toEqual({
      realizedUsd: "200",
      closedRoundTrips: 1,
      winningRoundTrips: 1,
      unmatchedDisposals: 2,
    });
  });

  it("refuses to turn one wei of cost basis into a whole position's gain", () => {
    const dustBuy = activity({
      activityId: 1n,
      observedAtSeconds: 1000,
      spent: leg(USDC, 6, "1", "0.000001"),
      received: leg(WETH, 18, "1", "0.000001"),
    });
    const wholeSell = activity({
      activityId: 2n,
      observedAtSeconds: 2000,
      spent: leg(WETH, 18, oneWeth, "5000"),
      received: leg(USDC, 6, "5000000000", "5000"),
    });

    expect(realizedResult([dustBuy, wholeSell])).toEqual({
      realizedUsd: "-0.000000999999995",
      closedRoundTrips: 1,
      winningRoundTrips: 0,
      unmatchedDisposals: 2,
    });
  });

  it("keeps two tokens on the same chain in separate queues", () => {
    const buyWeth = activity({
      activityId: 1n,
      observedAtSeconds: 1000,
      spent: leg(USDC, 6, "1000000000", "1000"),
      received: leg(WETH, 18, oneWeth, "1000"),
    });
    const buyArb = activity({
      activityId: 2n,
      observedAtSeconds: 2000,
      spent: leg(USDC, 6, "500000000", "500"),
      received: leg(ARB, 18, oneWeth, "500"),
    });
    const sellArb = activity({
      activityId: 3n,
      observedAtSeconds: 3000,
      spent: leg(ARB, 18, oneWeth, "620"),
      received: leg(USDC, 6, "620000000", "620"),
    });

    expect(realizedResult([buyWeth, buyArb, sellArb])).toEqual({
      realizedUsd: "120",
      closedRoundTrips: 1,
      winningRoundTrips: 1,
      unmatchedDisposals: 2,
    });
  });

  it("keeps the same token address on two chains in separate queues", () => {
    const buyOnBase = activity({
      activityId: 1n,
      observedAtSeconds: 1000,
      chainId: 8453n,
      spent: leg(USDC, 6, "1000000000", "1000"),
      received: leg(WETH, 18, oneWeth, "1000"),
    });
    const sellOnArbitrum = activity({
      activityId: 2n,
      observedAtSeconds: 2000,
      chainId: 42161n,
      spent: leg(WETH, 18, oneWeth, "1400"),
      received: leg(USDC, 6, "1400000000", "1400"),
    });

    expect(realizedResult([buyOnBase, sellOnArbitrum])).toEqual({
      realizedUsd: "0",
      closedRoundTrips: 0,
      winningRoundTrips: 0,
      unmatchedDisposals: 2,
    });
  });

  it("matches a token address recorded in differing case as the same inventory", () => {
    const buy = activity({
      activityId: 1n,
      observedAtSeconds: 1000,
      spent: leg(USDC, 6, "1000000000", "1000"),
      received: leg(WETH.toUpperCase(), 18, oneWeth, "1000"),
    });
    const sell = activity({
      activityId: 2n,
      observedAtSeconds: 2000,
      spent: leg(WETH, 18, oneWeth, "1250"),
      received: leg(USDC, 6, "1250000000", "1250"),
    });

    expect(realizedResult([buy, sell]).closedRoundTrips).toBe(1);
  });

  it("preserves eighteen decimal places when a cost basis splits unevenly", () => {
    const buy = activity({
      activityId: 1n,
      observedAtSeconds: 1000,
      spent: leg(USDC, 6, "1000000000", "1000"),
      received: leg(WETH, 18, threeWeth, "1000"),
    });
    const sell = activity({
      activityId: 2n,
      observedAtSeconds: 2000,
      spent: leg(WETH, 18, oneWeth, "400"),
      received: leg(USDC, 6, "400000000", "400"),
    });

    expect(realizedResult([buy, sell]).realizedUsd).toBe("66.666666666666666667");
  });

  it("keeps a dust-sized eighteen decimal quantity exact through a round trip", () => {
    const buy = activity({
      activityId: 1n,
      observedAtSeconds: 1000,
      spent: leg(USDC, 6, "1", "0.000001"),
      received: leg(WETH, 18, "1", "0.000000000000000001"),
    });
    const sell = activity({
      activityId: 2n,
      observedAtSeconds: 2000,
      spent: leg(WETH, 18, "1", "0.000000000000000003"),
      received: leg(USDC, 6, "1", "0.000001"),
    });

    expect(realizedResult([buy, sell]).realizedUsd).toBe("0.000000000000000002");
  });

  it("orders trades chronologically regardless of the order they arrive in", () => {
    const buy = activity({
      activityId: 1n,
      observedAtSeconds: 1000,
      spent: leg(USDC, 6, "1000000000", "1000"),
      received: leg(WETH, 18, oneWeth, "1000"),
    });
    const sell = activity({
      activityId: 2n,
      observedAtSeconds: 2000,
      spent: leg(WETH, 18, oneWeth, "1500"),
      received: leg(USDC, 6, "1500000000", "1500"),
    });

    expect(realizedResult([sell, buy])).toEqual(realizedResult([buy, sell]));
  });

  it("breaks ties on activity id so equal timestamps keep a stable order", () => {
    const buy = activity({
      activityId: 1n,
      observedAtSeconds: 1000,
      spent: leg(USDC, 6, "1000000000", "1000"),
      received: leg(WETH, 18, oneWeth, "1000"),
    });
    const sell = activity({
      activityId: 2n,
      observedAtSeconds: 1000,
      spent: leg(WETH, 18, oneWeth, "1500"),
      received: leg(USDC, 6, "1500000000", "1500"),
    });

    expect(realizedResult([sell, buy]).closedRoundTrips).toBe(1);
  });

  it("ignores bridge legs, which move inventory without opening or closing a position", () => {
    const bridge = activity({
      activityId: 1n,
      observedAtSeconds: 1000,
      kind: "bridge",
      eventRole: "bridge_deposit",
      spent: leg(USDC, 6, "1000000000", "1000"),
      received: leg(USDC, 6, "999000000", "999"),
    });

    expect(realizedResult([bridge])).toEqual({
      realizedUsd: "0",
      closedRoundTrips: 0,
      winningRoundTrips: 0,
      unmatchedDisposals: 0,
    });
  });

  it("ignores swaps that the pricing lane has not priced", () => {
    const unpriced = activity({
      activityId: 1n,
      observedAtSeconds: 1000,
      pricingState: "unpriced",
      spent: leg(USDC, 6, "1000000000", null),
      received: leg(WETH, 18, oneWeth, null),
    });
    const pending = activity({
      activityId: 2n,
      observedAtSeconds: 2000,
      pricingState: "pending",
      spent: leg(USDC, 6, "1000000000", null),
      received: leg(WETH, 18, oneWeth, null),
    });

    expect(realizedResult([unpriced, pending])).toEqual({
      realizedUsd: "0",
      closedRoundTrips: 0,
      winningRoundTrips: 0,
      unmatchedDisposals: 0,
    });
  });

  it("ignores a swap whose acquired leg is absent", () => {
    const oneLegged = activity({
      activityId: 1n,
      observedAtSeconds: 1000,
      spent: leg(USDC, 6, "1000000000", "1000"),
      received: absentLeg,
    });

    expect(realizedResult([oneLegged])).toEqual({
      realizedUsd: "0",
      closedRoundTrips: 0,
      winningRoundTrips: 0,
      unmatchedDisposals: 0,
    });
  });

  it("counts a break-even close as a round trip that did not win", () => {
    const buy = activity({
      activityId: 1n,
      observedAtSeconds: 1000,
      spent: leg(USDC, 6, "1000000000", "1000"),
      received: leg(WETH, 18, oneWeth, "1000"),
    });
    const sell = activity({
      activityId: 2n,
      observedAtSeconds: 2000,
      spent: leg(WETH, 18, oneWeth, "1000"),
      received: leg(USDC, 6, "1000000000", "1000"),
    });

    expect(realizedResult([buy, sell])).toEqual({
      realizedUsd: "0",
      closedRoundTrips: 1,
      winningRoundTrips: 0,
      unmatchedDisposals: 1,
    });
  });
});
