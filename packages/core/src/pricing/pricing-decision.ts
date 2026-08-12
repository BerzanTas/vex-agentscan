import { backoffDelayMs } from "../backoff.js";

export type ActivityLeg = { executedRaw: string; tokenAddress: string; decimals: number };

export type LegPricing =
  | { state: "absent" }
  | { state: "priced"; usd: string }
  | { state: "unpriceable"; notBefore: Date | null }
  | { state: "unmappable" };

export type PricingOutcome =
  | { kind: "priced"; usdIn: string | null; usdOut: string | null }
  | { kind: "reschedule"; delayMs: number }
  | { kind: "nothing_to_price" }
  | { kind: "no_settlement_time" }
  | { kind: "unmappable" }
  | { kind: "attempts_exhausted" };

export type PricingRetryBudget = {
  attempts: number;
  maxAttempts: number;
  schedule: readonly string[];
  now: Date;
};

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

function isDefinitiveMiss(leg: LegPricing): boolean {
  return leg.state === "unpriceable" && leg.notBefore !== null;
}

function pricedSiblingSettlesEveryMiss(legs: readonly LegPricing[]): boolean {
  if (!legs.some((leg) => leg.state === "priced")) return false;
  return legs.every((leg) => leg.state !== "unpriceable" || isDefinitiveMiss(leg));
}

function latestNotBefore(legs: readonly LegPricing[]): Date | null {
  let latest: Date | null = null;
  for (const leg of legs) {
    if (leg.state !== "unpriceable" || leg.notBefore === null) continue;
    if (latest === null || leg.notBefore > latest) latest = leg.notBefore;
  }
  return latest;
}

export function pricingRetryOutcome(
  budget: PricingRetryBudget,
  notBefore: Date | null,
): Extract<PricingOutcome, { kind: "reschedule" } | { kind: "attempts_exhausted" }> {
  if (budget.attempts + 1 >= budget.maxAttempts) return { kind: "attempts_exhausted" };
  const scheduledMs = backoffDelayMs(budget.attempts, budget.schedule);
  const blockedMs = notBefore === null ? 0 : notBefore.getTime() - budget.now.getTime();
  return { kind: "reschedule", delayMs: Math.max(scheduledMs, blockedMs) };
}

export function decidePricingOutcome(
  args: PricingRetryBudget & { settledAt: Date | null; legIn: LegPricing; legOut: LegPricing },
): PricingOutcome {
  const legs = [args.legIn, args.legOut];
  if (legs.every((leg) => leg.state === "absent")) return { kind: "nothing_to_price" };
  if (args.settledAt === null) return { kind: "no_settlement_time" };
  if (legs.some((leg) => leg.state === "unmappable")) return { kind: "unmappable" };
  if (legs.some((leg) => leg.state === "unpriceable") && !pricedSiblingSettlesEveryMiss(legs)) {
    return pricingRetryOutcome(args, latestNotBefore(legs));
  }
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
