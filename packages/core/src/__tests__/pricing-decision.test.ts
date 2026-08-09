import { describe, expect, it } from "vitest";
import { decidePricingOutcome, presentLeg, priceDivergenceRatio } from "../pricing/pricing-decision.js";

const schedule = ["1m", "5m", "30m", "2h", "12h"];
const maxAttempts = 5;
const absent = { state: "absent" } as const;
const unpriceable = { state: "unpriceable" } as const;
const priced = (usd: string) => ({ state: "priced", usd }) as const;

function outcomeFor(legIn: Parameters<typeof decidePricingOutcome>[0]["legIn"], legOut: typeof legIn, attempts = 0) {
  return decidePricingOutcome({ legIn, legOut, attempts, maxAttempts, schedule });
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

  it("reschedules when a present leg is unpriceable", () => {
    expect(outcomeFor(unpriceable, priced("10.4"))).toEqual({ kind: "reschedule", delayMs: 60_000 });
  });

  it("reschedules when the other present leg is unpriceable", () => {
    expect(outcomeFor(priced("10.5"), unpriceable)).toEqual({ kind: "reschedule", delayMs: 60_000 });
  });

  it("walks the backoff schedule as attempts accumulate", () => {
    const delays = [0, 1, 2, 3].map((attempts) => outcomeFor(unpriceable, absent, attempts));
    expect(delays).toEqual([
      { kind: "reschedule", delayMs: 60_000 },
      { kind: "reschedule", delayMs: 300_000 },
      { kind: "reschedule", delayMs: 1_800_000 },
      { kind: "reschedule", delayMs: 7_200_000 },
    ]);
  });

  it("becomes terminally unpriced exactly at the attempt ceiling", () => {
    expect(outcomeFor(unpriceable, absent, 3)).toEqual({ kind: "reschedule", delayMs: 7_200_000 });
    expect(outcomeFor(unpriceable, absent, 4)).toEqual({ kind: "attempts_exhausted" });
    expect(outcomeFor(unpriceable, absent, 5)).toEqual({ kind: "attempts_exhausted" });
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
