import { describe, expect, it } from "vitest";
import {
  decidePricingOutcome,
  presentLeg,
  priceDivergenceRatio,
  pricingRetryOutcome,
  type LegPricing,
} from "../pricing/pricing-decision.js";

const schedule = ["1m", "5m", "30m", "2h", "12h"];
const maxAttempts = 6;
const now = new Date("2026-08-04T12:00:00Z");
const absent = { state: "absent" } as const;
const unmappable = { state: "unmappable" } as const;
const blocked = { state: "unpriceable", notBefore: null } as const;
const blockedUntil = (notBefore: Date) => ({ state: "unpriceable", notBefore }) as const;
const priced = (usd: string) => ({ state: "priced", usd }) as const;

const settledAt = new Date("2026-08-04T10:41:00Z");

function outcomeFor(legIn: LegPricing, legOut: LegPricing, attempts = 0) {
  return decidePricingOutcome({ legIn, legOut, attempts, maxAttempts, schedule, now, settledAt });
}

function outcomeWithoutSettlementTime(legIn: LegPricing, legOut: LegPricing, attempts = 0) {
  return decidePricingOutcome({ legIn, legOut, attempts, maxAttempts, schedule, now, settledAt: null });
}

describe("presentLeg", () => {
  it("is present when raw amount, token address and decimals are all set", () => {
    expect(presentLeg({ executedRaw: "1000", tokenAddress: "0xabc", decimals: 6 })).toEqual({
      executedRaw: "1000",
      tokenAddress: "0xabc",
      decimals: 6,
    });
  });

  it("is absent when the raw amount is missing", () => {
    expect(presentLeg({ executedRaw: null, tokenAddress: "0xabc", decimals: 6 })).toBeNull();
  });

  it("is absent when the token address is missing", () => {
    expect(presentLeg({ executedRaw: "1000", tokenAddress: null, decimals: 6 })).toBeNull();
  });

  it("is absent when the decimals are missing", () => {
    expect(presentLeg({ executedRaw: "1000", tokenAddress: "0xabc", decimals: null })).toBeNull();
  });
});

describe("decidePricingOutcome", () => {
  it("prices both legs when both are present and priced", () => {
    expect(outcomeFor(priced("10.5"), priced("10.4"))).toEqual({
      kind: "priced",
      usdIn: "10.5",
      usdOut: "10.4",
    });
  });

  it("prices an IN-only activity with a null OUT amount", () => {
    expect(outcomeFor(priced("10.5"), absent)).toEqual({ kind: "priced", usdIn: "10.5", usdOut: null });
  });

  it("prices an OUT-only activity with a null IN amount", () => {
    expect(outcomeFor(absent, priced("10.4"))).toEqual({ kind: "priced", usdIn: null, usdOut: "10.4" });
  });

  it("is terminally unpriced when no leg is present", () => {
    expect(outcomeFor(absent, absent)).toEqual({ kind: "nothing_to_price" });
  });

  it("does not consume an attempt when no leg is present", () => {
    expect(outcomeFor(absent, absent, 0)).toEqual({ kind: "nothing_to_price" });
    expect(outcomeFor(absent, absent, 4)).toEqual({ kind: "nothing_to_price" });
  });

  it("is terminal on the first pass when the activity carries no settlement time", () => {
    expect(outcomeWithoutSettlementTime(priced("10.5"), priced("10.4"))).toEqual({ kind: "no_settlement_time" });
  });

  it("refuses the settlement-time-less activity however priceable its legs are, at any attempt", () => {
    expect(outcomeWithoutSettlementTime(priced("10.5"), absent, 0)).toEqual({ kind: "no_settlement_time" });
    expect(outcomeWithoutSettlementTime(blocked, absent, 4)).toEqual({ kind: "no_settlement_time" });
    expect(outcomeWithoutSettlementTime(unmappable, absent, 0)).toEqual({ kind: "no_settlement_time" });
  });

  it("still reports a settlement-time-less activity with no legs as nothing to price", () => {
    expect(outcomeWithoutSettlementTime(absent, absent)).toEqual({ kind: "nothing_to_price" });
  });

  it("is terminally unmappable on the first pass when a leg has no feed identity", () => {
    expect(outcomeFor(unmappable, absent, 0)).toEqual({ kind: "unmappable" });
  });

  it("prefers the unmappable verdict over a retryable leg, because only a deploy can change it", () => {
    expect(outcomeFor(unmappable, blocked, 0)).toEqual({ kind: "unmappable" });
    expect(outcomeFor(priced("10.5"), unmappable, 0)).toEqual({ kind: "unmappable" });
  });

  it("reschedules when a present leg is unpriceable", () => {
    expect(outcomeFor(blocked, priced("10.4"))).toEqual({ kind: "reschedule", delayMs: 60_000 });
  });

  it("reschedules when the other present leg is unpriceable", () => {
    expect(outcomeFor(priced("10.5"), blocked)).toEqual({ kind: "reschedule", delayMs: 60_000 });
  });

  it("finalizes with a null IN leg when the feed answered without a price and the OUT leg priced", () => {
    const missedUntil = new Date(now.getTime() + 24 * 3_600_000);
    expect(outcomeFor(blockedUntil(missedUntil), priced("10.4"))).toEqual({
      kind: "priced",
      usdIn: null,
      usdOut: "10.4",
    });
  });

  it("finalizes with a null OUT leg when the feed answered without a price and the IN leg priced", () => {
    const missedUntil = new Date(now.getTime() + 24 * 3_600_000);
    expect(outcomeFor(priced("10.5"), blockedUntil(missedUntil))).toEqual({
      kind: "priced",
      usdIn: "10.5",
      usdOut: null,
    });
  });

  it("finalizes a definitive miss beside a priced leg even at the attempt ceiling", () => {
    const missedUntil = new Date(now.getTime() + 24 * 3_600_000);
    expect(outcomeFor(priced("10.5"), blockedUntil(missedUntil), 5)).toEqual({
      kind: "priced",
      usdIn: "10.5",
      usdOut: null,
    });
  });

  it("never finalizes a feed outage, priced sibling or not", () => {
    expect(outcomeFor(priced("10.5"), blocked, 0)).toEqual({ kind: "reschedule", delayMs: 60_000 });
    expect(outcomeFor(blocked, priced("10.4"), 1)).toEqual({ kind: "reschedule", delayMs: 300_000 });
  });

  it("exhausts a row whose every present leg missed rather than finalizing it without a figure", () => {
    const soon = new Date(now.getTime() + 3_600_000);
    const later = new Date(now.getTime() + 7_200_000);
    expect(outcomeFor(blockedUntil(soon), blockedUntil(later), 5)).toEqual({
      kind: "attempts_exhausted",
    });
  });

  it("walks the backoff schedule as attempts accumulate", () => {
    const delays = [0, 1, 2, 3, 4].map((attempts) => outcomeFor(blocked, absent, attempts));
    expect(delays).toEqual([
      { kind: "reschedule", delayMs: 60_000 },
      { kind: "reschedule", delayMs: 300_000 },
      { kind: "reschedule", delayMs: 1_800_000 },
      { kind: "reschedule", delayMs: 7_200_000 },
      { kind: "reschedule", delayMs: 43_200_000 },
    ]);
  });

  it("becomes terminally unpriced exactly at the attempt ceiling", () => {
    expect(outcomeFor(blocked, absent, 4)).toEqual({ kind: "reschedule", delayMs: 43_200_000 });
    expect(outcomeFor(blocked, absent, 5)).toEqual({ kind: "attempts_exhausted" });
    expect(outcomeFor(blocked, absent, 6)).toEqual({ kind: "attempts_exhausted" });
  });

  it("waits until the blocking fact can change rather than burning an attempt on an unchanged answer", () => {
    const notBefore = new Date(now.getTime() + 24 * 3_600_000);
    expect(outcomeFor(blockedUntil(notBefore), absent, 0)).toEqual({
      kind: "reschedule",
      delayMs: 24 * 3_600_000,
    });
  });

  it("keeps the scheduled delay when it already outlasts the blocking fact", () => {
    const notBefore = new Date(now.getTime() + 1_000);
    expect(outcomeFor(blockedUntil(notBefore), absent, 0)).toEqual({ kind: "reschedule", delayMs: 60_000 });
  });

  it("waits for the later of two blocked legs", () => {
    const soon = new Date(now.getTime() + 3_600_000);
    const later = new Date(now.getTime() + 7_200_000);
    expect(outcomeFor(blockedUntil(soon), blockedUntil(later), 0)).toEqual({
      kind: "reschedule",
      delayMs: 7_200_000,
    });
  });

  it("waits for the known wake-up time even when the other blocked leg has none", () => {
    const later = new Date(now.getTime() + 7_200_000);
    expect(outcomeFor(blocked, blockedUntil(later), 0)).toEqual({ kind: "reschedule", delayMs: 7_200_000 });
  });

  it("keeps the transient ladder when no blocked leg has a known wake-up time", () => {
    expect(outcomeFor(blocked, blocked, 0)).toEqual({ kind: "reschedule", delayMs: 60_000 });
  });

  it("never schedules a negative delay for a blocking fact already in the past", () => {
    const past = new Date(now.getTime() - 7_200_000);
    expect(outcomeFor(blockedUntil(past), absent, 0)).toEqual({ kind: "reschedule", delayMs: 60_000 });
  });
});

describe("pricingRetryOutcome", () => {
  it("ignores a blocking fact once the attempt ceiling is reached", () => {
    const notBefore = new Date(now.getTime() + 24 * 3_600_000);
    expect(pricingRetryOutcome({ attempts: 5, maxAttempts, schedule, now }, notBefore)).toEqual({
      kind: "attempts_exhausted",
    });
  });
});

describe("priceDivergenceRatio", () => {
  it("reports a ratio above the warn threshold", () => {
    expect(priceDivergenceRatio({ pricedUsd: "600", estimateUsd: "100", warnRatio: 5 })).toBe(6);
  });

  it("reports a ratio below the inverse warn threshold", () => {
    expect(priceDivergenceRatio({ pricedUsd: "10", estimateUsd: "100", warnRatio: 5 })).toBe(0.1);
  });

  it("stays silent inside the threshold band", () => {
    expect(priceDivergenceRatio({ pricedUsd: "500", estimateUsd: "100", warnRatio: 5 })).toBeNull();
    expect(priceDivergenceRatio({ pricedUsd: "20", estimateUsd: "100", warnRatio: 5 })).toBeNull();
  });

  it("stays silent when the client estimate is missing", () => {
    expect(priceDivergenceRatio({ pricedUsd: "600", estimateUsd: null, warnRatio: 5 })).toBeNull();
  });

  it("stays silent when the client estimate is zero", () => {
    expect(priceDivergenceRatio({ pricedUsd: "600", estimateUsd: "0", warnRatio: 5 })).toBeNull();
  });
});
