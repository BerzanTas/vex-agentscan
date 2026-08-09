import type pg from "pg";
import type { ChainFamily } from "@agentscan/core";

export type SqlExecutor = Pick<pg.PoolClient, "query">;

export type ClaimedPricingRow = {
  activityId: bigint;
  protocol: string;
  chainFamily: ChainFamily;
  chainId: bigint;
  priceHour: Date;
  attempts: number;
  executedInRaw: string | null;
  tokenInAddress: string | null;
  tokenInDecimals: number | null;
  usdInEst: string | null;
  executedOutRaw: string | null;
  tokenOutAddress: string | null;
  tokenOutDecimals: number | null;
  usdOutEst: string | null;
};

type ClaimedPricingRowShape = {
  id: string;
  protocol: string;
  chain_family: ChainFamily;
  chain_id: string;
  price_hour: Date;
  pricing_attempts: number;
  executed_in_raw: string | null;
  token_in_address: string | null;
  token_in_decimals: number | null;
  usd_in_est: string | null;
  executed_out_raw: string | null;
  token_out_address: string | null;
  token_out_decimals: number | null;
  usd_out_est: string | null;
};

export async function claimDuePricingRows(
  pool: pg.Pool,
  limit: number,
  leaseSec: number,
): Promise<ClaimedPricingRow[]> {
  const result = await pool.query<ClaimedPricingRowShape>(
    `UPDATE activities
     SET pricing_next_attempt_at = now() + make_interval(secs => $2::float8)
     WHERE id IN (
       SELECT id FROM activities
       WHERE pricing_state = 'pending'
         AND verification_state IN ('verified_full','verified_basic')
         AND (pricing_next_attempt_at IS NULL OR pricing_next_attempt_at <= now())
         AND COALESCE(client_confirmed_at, verified_at) IS NOT NULL
       ORDER BY id
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, protocol, chain_family, chain_id,
               date_trunc('hour', COALESCE(client_confirmed_at, verified_at)) AS price_hour,
               pricing_attempts,
               executed_in_raw, token_in_address, token_in_decimals, usd_in_est,
               executed_out_raw, token_out_address, token_out_decimals, usd_out_est`,
    [limit, leaseSec],
  );
  return result.rows.map((row) => ({
    activityId: BigInt(row.id),
    protocol: row.protocol,
    chainFamily: row.chain_family,
    chainId: BigInt(row.chain_id),
    priceHour: row.price_hour,
    attempts: row.pricing_attempts,
    executedInRaw: row.executed_in_raw,
    tokenInAddress: row.token_in_address,
    tokenInDecimals: row.token_in_decimals,
    usdInEst: row.usd_in_est,
    executedOutRaw: row.executed_out_raw,
    tokenOutAddress: row.token_out_address,
    tokenOutDecimals: row.token_out_decimals,
    usdOutEst: row.usd_out_est,
  }));
}

export type TokenPriceKey = { chainFamily: ChainFamily; chainId: bigint; tokenAddress: string };

export type CachedTokenPrice = { priceUsd: string | null; fetchedAt: Date };

type TokenPriceRow = {
  chain_family: ChainFamily;
  chain_id: string;
  token_address: string;
  price_usd: string | null;
  fetched_at: Date;
};

export function tokenPriceCacheKey(key: TokenPriceKey): string {
  return `${key.chainFamily}:${key.chainId}:${key.tokenAddress}`;
}

export async function readTokenPrices(
  exec: SqlExecutor,
  priceHour: Date,
  keys: readonly TokenPriceKey[],
): Promise<Map<string, CachedTokenPrice>> {
  const cached = new Map<string, CachedTokenPrice>();
  if (keys.length === 0) return cached;
  const params: string[] = [priceHour.toISOString()];
  const tuples = keys.map((key) => {
    params.push(key.chainFamily, key.chainId.toString(), key.tokenAddress);
    return `($${params.length - 2}, $${params.length - 1}::bigint, $${params.length})`;
  });
  const result = await exec.query<TokenPriceRow>(
    `SELECT chain_family, chain_id, token_address, price_usd, fetched_at
     FROM token_prices
     WHERE price_hour = $1::timestamptz
       AND (chain_family, chain_id, token_address) IN (${tuples.join(", ")})`,
    params,
  );
  for (const row of result.rows) {
    cached.set(
      tokenPriceCacheKey({
        chainFamily: row.chain_family,
        chainId: BigInt(row.chain_id),
        tokenAddress: row.token_address,
      }),
      { priceUsd: row.price_usd, fetchedAt: row.fetched_at },
    );
  }
  return cached;
}

export type TokenPriceRecord = TokenPriceKey & {
  priceHour: Date;
  priceUsd: string | null;
  confidence: number | null;
  source: string;
};

export async function upsertTokenPrice(exec: SqlExecutor, record: TokenPriceRecord): Promise<void> {
  await exec.query(
    `INSERT INTO token_prices
       (chain_family, chain_id, token_address, price_hour, price_usd, confidence, source, fetched_at)
     VALUES ($1, $2::bigint, $3, $4::timestamptz, $5::numeric, $6::numeric, $7, now())
     ON CONFLICT (chain_family, chain_id, token_address, price_hour)
     DO UPDATE SET price_usd = EXCLUDED.price_usd,
                   confidence = EXCLUDED.confidence,
                   source = EXCLUDED.source,
                   fetched_at = now()
     WHERE token_prices.price_usd IS NULL`,
    [
      record.chainFamily,
      record.chainId.toString(),
      record.tokenAddress,
      record.priceHour.toISOString(),
      record.priceUsd,
      record.confidence,
      record.source,
    ],
  );
}

export async function markServerPriced(
  exec: SqlExecutor,
  activityId: bigint,
  usdIn: string | null,
  usdOut: string | null,
): Promise<void> {
  await exec.query(
    `UPDATE activities
     SET pricing_state = 'server_priced',
         usd_in_priced = $2::numeric,
         usd_out_priced = $3::numeric,
         priced_at = now(),
         pricing_next_attempt_at = NULL
     WHERE id = $1 AND pricing_state = 'pending'`,
    [activityId.toString(), usdIn, usdOut],
  );
}

export async function reschedulePricing(exec: SqlExecutor, activityId: bigint, delayMs: number): Promise<void> {
  await exec.query(
    `UPDATE activities
     SET pricing_attempts = pricing_attempts + 1,
         pricing_next_attempt_at = now() + make_interval(secs => $2::float8)
     WHERE id = $1 AND pricing_state = 'pending'`,
    [activityId.toString(), delayMs / 1000],
  );
}

export async function abandonPricing(exec: SqlExecutor, activityId: bigint): Promise<void> {
  await exec.query(
    `UPDATE activities
     SET pricing_state = 'unpriced', pricing_next_attempt_at = NULL
     WHERE id = $1 AND pricing_state = 'pending'`,
    [activityId.toString()],
  );
}

export async function exhaustPricing(exec: SqlExecutor, activityId: bigint): Promise<void> {
  await exec.query(
    `UPDATE activities
     SET pricing_state = 'unpriced',
         pricing_attempts = pricing_attempts + 1,
         pricing_next_attempt_at = NULL
     WHERE id = $1 AND pricing_state = 'pending'`,
    [activityId.toString()],
  );
}
