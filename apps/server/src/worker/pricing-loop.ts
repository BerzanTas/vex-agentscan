import type pg from "pg";
import type { Logger } from "pino";
import {
  decidePricingOutcome,
  isPriceAcceptable,
  legUsd,
  presentLeg,
  priceDivergenceRatio,
  pricingRetryOutcome,
  resolveChain,
  resolveCoinKey,
  type ActivityLeg,
  type LegPricing,
  type PriceFeed,
  type PricingOutcome,
} from "@agentscan/core";
import type { Config } from "../config.js";
import {
  abandonPricing,
  addPricedVolume,
  claimDuePricingRows,
  exhaustPricing,
  markServerPriced,
  readTokenPrices,
  reschedulePricing,
  tokenPriceCacheKey,
  upsertTokenPrice,
  type ClaimedPricingRow,
  type TokenPriceKey,
} from "../repos/activity-pricing-repo.js";

const HOUR_MS = 3_600_000;
const PRICED_VOLUME_ROLES = ["swap", "bridge_deposit"];

export type PricingLoopDeps = {
  pool: pg.Pool;
  config: Config;
  logger: Logger;
  now: () => Date;
  priceFeed: PriceFeed;
  priceSource: string;
};

type LegSlot = "in" | "out";

type PreparedLeg =
  | { state: "absent" }
  | { state: "unmappable" }
  | { state: "resolved"; leg: ActivityLeg; coinKey: string; cacheKey: string; token: TokenPriceKey };

type PreparedRow = { row: ClaimedPricingRow; legIn: PreparedLeg; legOut: PreparedLeg };

type BucketPrices = { prices: Map<string, string>; refetchableAt: Map<string, Date> };

function legInputOf(row: ClaimedPricingRow, slot: LegSlot) {
  if (slot === "in") {
    return {
      executedRaw: row.executedInRaw,
      tokenAddress: row.tokenInAddress,
      decimals: row.tokenInDecimals,
    };
  }
  return {
    executedRaw: row.executedOutRaw,
    tokenAddress: row.tokenOutAddress,
    decimals: row.tokenOutDecimals,
  };
}

function prepareLeg(row: ClaimedPricingRow, slot: LegSlot): PreparedLeg {
  const leg = presentLeg(legInputOf(row, slot));
  if (leg === null) return { state: "absent" };
  const resolution = resolveCoinKey({
    protocol: row.protocol,
    chainFamily: row.chainFamily,
    chainId: row.chainId,
    tokenAddress: leg.tokenAddress,
  });
  if (resolution === null) return { state: "unmappable" };
  const token = {
    chainFamily: row.chainFamily,
    chainId: row.chainId,
    tokenAddress: resolution.tokenAddress,
  };
  return { state: "resolved", leg, coinKey: resolution.coinKey, cacheKey: tokenPriceCacheKey(token), token };
}

function prepareRow(row: ClaimedPricingRow): PreparedRow {
  return { row, legIn: prepareLeg(row, "in"), legOut: prepareLeg(row, "out") };
}

function bucketsByPriceHour(rows: ClaimedPricingRow[]): Map<number, PreparedRow[]> {
  const buckets = new Map<number, PreparedRow[]>();
  for (const row of rows) {
    const hourMs = row.priceHour.getTime();
    const bucket = buckets.get(hourMs) ?? [];
    bucket.push(prepareRow(row));
    buckets.set(hourMs, bucket);
  }
  return buckets;
}

function resolvedTokensOf(prepared: PreparedRow[]): Map<string, { token: TokenPriceKey; coinKey: string }> {
  const tokens = new Map<string, { token: TokenPriceKey; coinKey: string }>();
  for (const { legIn, legOut } of prepared) {
    for (const leg of [legIn, legOut]) {
      if (leg.state !== "resolved") continue;
      tokens.set(leg.cacheKey, { token: leg.token, coinKey: leg.coinKey });
    }
  }
  return tokens;
}

async function bucketPrices(
  deps: PricingLoopDeps,
  priceHour: Date,
  prepared: PreparedRow[],
): Promise<BucketPrices> {
  const resolved: BucketPrices = { prices: new Map(), refetchableAt: new Map() };
  const tokens = resolvedTokensOf(prepared);
  if (tokens.size === 0) return resolved;

  const cached = await readTokenPrices(deps.pool, priceHour, [...tokens.values()].map((entry) => entry.token));
  const missRetryMs = deps.config.PRICE_MISS_RETRY_HOURS * HOUR_MS;
  const now = deps.now();
  const refetchMissesBefore = new Date(now.getTime() - missRetryMs);
  const unresolved: { cacheKey: string; token: TokenPriceKey; coinKey: string }[] = [];
  for (const [cacheKey, entry] of tokens) {
    const hit = cached.get(cacheKey);
    if (hit !== undefined && hit.priceUsd !== null) {
      resolved.prices.set(cacheKey, hit.priceUsd);
      continue;
    }
    if (hit !== undefined && hit.fetchedAt > refetchMissesBefore) {
      resolved.refetchableAt.set(cacheKey, new Date(hit.fetchedAt.getTime() + missRetryMs));
      continue;
    }
    unresolved.push({ cacheKey, ...entry });
  }
  if (unresolved.length === 0) return resolved;

  const anchorSecond = Math.floor(priceHour.getTime() / 1000);
  const points = await fetchPoints(deps, anchorSecond, unresolved, priceHour);
  if (points === null) return resolved;

  const gate = {
    minConfidence: deps.config.PRICE_MIN_CONFIDENCE,
    maxDriftSec: deps.config.PRICE_MAX_DRIFT_SEC,
  };
  for (const entry of unresolved) {
    const point = points.get(entry.coinKey);
    const accepted = point !== undefined && isPriceAcceptable(point, anchorSecond, gate);
    await upsertTokenPrice(deps.pool, {
      ...entry.token,
      priceHour,
      priceUsd: accepted ? point.priceUsd : null,
      confidence: point?.confidence ?? null,
      source: deps.priceSource,
    });
    if (accepted) resolved.prices.set(entry.cacheKey, point.priceUsd);
    else resolved.refetchableAt.set(entry.cacheKey, new Date(now.getTime() + missRetryMs));
  }
  return resolved;
}

async function fetchPoints(
  deps: PricingLoopDeps,
  anchorSecond: number,
  unresolved: { coinKey: string }[],
  priceHour: Date,
): Promise<Awaited<ReturnType<PriceFeed["historical"]>> | null> {
  const coinKeys = [...new Set(unresolved.map((entry) => entry.coinKey))];
  try {
    return await deps.priceFeed.historical(coinKeys.map((coinKey) => ({ coinKey, atSecond: anchorSecond })));
  } catch (error) {
    deps.logger.warn(
      { err: error, priceHour, coins: coinKeys.length },
      "price feed unavailable for hour bucket; rescheduling its activities",
    );
    return null;
  }
}

function legPricingOf(leg: PreparedLeg, resolved: BucketPrices): LegPricing {
  if (leg.state === "absent") return { state: "absent" };
  if (leg.state === "unmappable") return { state: "unmappable" };
  const priceUsd = resolved.prices.get(leg.cacheKey);
  if (priceUsd === undefined) {
    return { state: "unpriceable", notBefore: resolved.refetchableAt.get(leg.cacheKey) ?? null };
  }
  const usd = legUsd({ executedRaw: leg.leg.executedRaw, decimals: leg.leg.decimals, priceUsd });
  return usd === null ? { state: "unpriceable", notBefore: null } : { state: "priced", usd };
}

function retryBudgetOf(deps: PricingLoopDeps, row: ClaimedPricingRow) {
  return {
    attempts: row.attempts,
    maxAttempts: deps.config.PRICING_MAX_ATTEMPTS,
    schedule: deps.config.PRICING_BACKOFF_SCHEDULE,
    now: deps.now(),
  };
}

function pricedVolumeOf(row: ClaimedPricingRow, usdIn: string | null): string {
  if (!PRICED_VOLUME_ROLES.includes(row.eventRole)) return "0";
  return usdIn ?? "0";
}

async function inTransaction<T>(pool: pg.Pool, run: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function publishPricedActivity(
  deps: PricingLoopDeps,
  row: ClaimedPricingRow,
  outcome: Extract<PricingOutcome, { kind: "priced" }>,
): Promise<void> {
  await inTransaction(deps.pool, async (client) => {
    const claimedByThisPass = await markServerPriced(client, row.activityId, outcome.usdIn, outcome.usdOut);
    if (!claimedByThisPass) return;
    await addPricedVolume(client, {
      day: row.aggregateDay,
      protocol: row.protocol,
      kind: row.kind,
      volumeUsd: pricedVolumeOf(row, outcome.usdIn),
    });
  });
}

async function applyOutcome(
  deps: PricingLoopDeps,
  row: ClaimedPricingRow,
  outcome: PricingOutcome,
): Promise<void> {
  if (outcome.kind === "priced") {
    await publishPricedActivity(deps, row, outcome);
    return;
  }
  if (outcome.kind === "reschedule") {
    await reschedulePricing(deps.pool, row.activityId, outcome.delayMs);
    return;
  }
  if (outcome.kind === "attempts_exhausted") {
    await exhaustPricing(deps.pool, row.activityId);
    return;
  }
  await abandonPricing(deps.pool, row.activityId);
}

function chainSlugOf(row: ClaimedPricingRow): string | null {
  return resolveChain({ protocol: row.protocol, chainFamily: row.chainFamily, chainId: row.chainId })
    ?.canonicalSlug ?? null;
}

function warnOnMissingSettlementTime(deps: PricingLoopDeps, row: ClaimedPricingRow): void {
  deps.logger.warn(
    {
      activityId: row.activityId.toString(),
      chainSlug: chainSlugOf(row),
      protocol: row.protocol,
      verifiedDay: row.aggregateDay,
    },
    "pricing activity has no settlement time; abandoning it rather than dating it by our own clock",
  );
}

function warnOnDivergence(
  deps: PricingLoopDeps,
  row: ClaimedPricingRow,
  slot: LegSlot,
  pricedUsd: string | null,
): void {
  if (pricedUsd === null) return;
  const estimateUsd = slot === "in" ? row.usdInEst : row.usdOutEst;
  const ratio = priceDivergenceRatio({
    pricedUsd,
    estimateUsd,
    warnRatio: deps.config.PRICE_DIVERGENCE_WARN_RATIO,
  });
  if (ratio === null) return;
  deps.logger.warn(
    {
      activityId: row.activityId.toString(),
      chainSlug: chainSlugOf(row),
      chainFamily: row.chainFamily,
      chainId: row.chainId.toString(),
      protocol: row.protocol,
      leg: slot,
      tokenAddress: slot === "in" ? row.tokenInAddress : row.tokenOutAddress,
      pricedUsd,
      estimateUsd,
      ratio,
    },
    "pricing divergence",
  );
}

type PricedRowOutcome = { row: ClaimedPricingRow; outcome: PricingOutcome };

type CoverageSlice = {
  chainSlug: string | null;
  chainFamily: string;
  chainId: string;
  protocol: string;
  serverPriced: number;
  unpriceable: number;
  nothingToPrice: number;
};

type PricingCoverageReport = {
  processed: number;
  serverPriced: number;
  unpriceable: number;
  nothingToPrice: number;
  rescheduled: number;
  byChainProtocol: CoverageSlice[];
};

function countInSlice(slice: CoverageSlice, outcome: PricingOutcome): void {
  if (outcome.kind === "priced") slice.serverPriced += 1;
  else if (outcome.kind === "nothing_to_price" || outcome.kind === "no_settlement_time") slice.nothingToPrice += 1;
  else slice.unpriceable += 1;
}

function pricingCoverageReport(results: readonly PricedRowOutcome[]): PricingCoverageReport {
  const slices = new Map<string, CoverageSlice>();
  for (const { row, outcome } of results) {
    if (outcome.kind === "reschedule") continue;
    const chainId = row.chainId.toString();
    const key = `${row.chainFamily}:${chainId}:${row.protocol}`;
    const slice = slices.get(key) ?? {
      chainSlug: chainSlugOf(row),
      chainFamily: row.chainFamily,
      chainId,
      protocol: row.protocol,
      serverPriced: 0,
      unpriceable: 0,
      nothingToPrice: 0,
    };
    countInSlice(slice, outcome);
    slices.set(key, slice);
  }
  const byChainProtocol = [...slices.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, slice]) => slice);
  return {
    processed: results.length,
    serverPriced: byChainProtocol.reduce((total, slice) => total + slice.serverPriced, 0),
    unpriceable: byChainProtocol.reduce((total, slice) => total + slice.unpriceable, 0),
    nothingToPrice: byChainProtocol.reduce((total, slice) => total + slice.nothingToPrice, 0),
    rescheduled: results.filter(({ outcome }) => outcome.kind === "reschedule").length,
    byChainProtocol,
  };
}

async function priceRow(
  deps: PricingLoopDeps,
  prepared: PreparedRow,
  resolved: BucketPrices,
): Promise<PricingOutcome> {
  const outcome = decidePricingOutcome({
    ...retryBudgetOf(deps, prepared.row),
    settledAt: prepared.row.settledAt,
    legIn: legPricingOf(prepared.legIn, resolved),
    legOut: legPricingOf(prepared.legOut, resolved),
  });
  if (outcome.kind === "no_settlement_time") warnOnMissingSettlementTime(deps, prepared.row);
  await applyOutcome(deps, prepared.row, outcome);
  if (outcome.kind === "priced") {
    warnOnDivergence(deps, prepared.row, "in", outcome.usdIn);
    warnOnDivergence(deps, prepared.row, "out", outcome.usdOut);
  }
  return outcome;
}

async function containRowFailure(
  deps: PricingLoopDeps,
  row: ClaimedPricingRow,
  error: unknown,
): Promise<PricingOutcome> {
  const outcome = pricingRetryOutcome(retryBudgetOf(deps, row), null);
  deps.logger.warn(
    { err: error, activityId: row.activityId.toString(), outcome: outcome.kind },
    "pricing a single activity threw; containing it to that row",
  );
  try {
    await applyOutcome(deps, row, outcome);
  } catch (applyError) {
    deps.logger.error(
      { err: applyError, activityId: row.activityId.toString() },
      "could not record the contained pricing failure; the lease will retry it",
    );
  }
  return outcome;
}

export async function runPricingPass(deps: PricingLoopDeps): Promise<number> {
  const rows = await claimDuePricingRows(deps.pool, deps.config.PRICING_BATCH_MAX, deps.config.PRICING_LEASE_SEC);
  if (rows.length === 0) return 0;
  const results: PricedRowOutcome[] = [];
  for (const [hourMs, prepared] of bucketsByPriceHour(rows)) {
    const priceHour = new Date(hourMs);
    const prices = await bucketPrices(deps, priceHour, prepared);
    for (const entry of prepared) {
      try {
        results.push({ row: entry.row, outcome: await priceRow(deps, entry, prices) });
      } catch (error) {
        results.push({ row: entry.row, outcome: await containRowFailure(deps, entry.row, error) });
      }
    }
  }
  deps.logger.info(pricingCoverageReport(results), "pricing coverage");
  return rows.length;
}

export function startPricingLoop(deps: PricingLoopDeps): () => void {
  let passInFlight = false;
  const tick = async (): Promise<void> => {
    if (passInFlight) return;
    passInFlight = true;
    try {
      await runPricingPass(deps);
    } catch (error) {
      deps.logger.error({ err: error }, "pricing pass failed");
    } finally {
      passInFlight = false;
    }
  };
  const timer = setInterval(() => void tick(), deps.config.PRICING_POLL_INTERVAL_SEC * 1000);
  void tick();
  return () => clearInterval(timer);
}
