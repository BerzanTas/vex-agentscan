import { backoffDelayMs } from "../backoff.js";

export type ActivityLeg = { executedRaw: string; tokenAddress: string; decimals: number };

export type LegPricing =
  | { state: "absent" }
  | { state: "priced"; usd: string }
  | { state: "unpriceable" };

export type PricingOutcome =
  | { kind: "priced"; usdIn: string | null; usdOut: string | null }
  | { kind: "reschedule"; delayMs: number }
  | { kind: "nothing_to_price" }
  | { kind: "attempts_exhausted" };

export function presentLeg(args: {
  executedRaw: string | null;
  tokenAddress: string | null;
  decimals: number | null;
}): ActivityLeg | null {
  if (args.executedRaw === null || args.tokenAddress === null || args.decimals === null) return null;
  return { executedRaw: args.executedRaw, tokenAddress: args.tokenAddress, decimals: args.decimals };
}

function usdOf(leg: LegPricing): string | null {
  return leg.state === "priced" ? leg.usd : null;
}

export type PricingRetryBudget = { attempts: number; maxAttempts: number; schedule: readonly string[] };

export function pricingRetryOutcome(
  budget: PricingRetryBudget,
): Extract<PricingOutcome, { kind: "reschedule" } | { kind: "attempts_exhausted" }> {
  if (budget.attempts + 1 >= budget.maxAttempts) return { kind: "attempts_exhausted" };
  return { kind: "reschedule", delayMs: backoffDelayMs(budget.attempts, budget.schedule) };
}

export function decidePricingOutcome(
  args: PricingRetryBudget & { legIn: LegPricing; legOut: LegPricing },
): PricingOutcome {
  if (args.legIn.state === "absent" && args.legOut.state === "absent") return { kind: "nothing_to_price" };
  if (args.legIn.state === "unpriceable" || args.legOut.state === "unpriceable") return pricingRetryOutcome(args);
  return { kind: "priced", usdIn: usdOf(args.legIn), usdOut: usdOf(args.legOut) };
}

export function priceDivergenceRatio(args: {
  pricedUsd: string;
  estimateUsd: string | null;
  warnRatio: number;
}): number | null {
  if (args.estimateUsd === null) return null;
  const estimate = Number(args.estimateUsd);
  const priced = Number(args.pricedUsd);
  if (!Number.isFinite(estimate) || estimate === 0 || !Number.isFinite(priced)) return null;
  const ratio = priced / estimate;
  if (ratio > args.warnRatio || ratio < 1 / args.warnRatio) return ratio;
  return null;
}
