import type pg from "pg";
import type { ChartRangePlan } from "@agentscan/core";
import { activityTimeAnchorSql } from "./activity-time-anchor.js";
import { serverPricedUsdIn, serverPricedUsdOut } from "./server-priced-usd.js";

const VERIFIED_STATES = "('verified_full','verified_basic')";
const OBSERVED_AT = activityTimeAnchorSql("a");
const DAY_SECONDS = 86_400;

type BucketWindow = { bucketSeconds: number; bucketCount: number | null };

function bucketWindowOf(plan: ChartRangePlan): BucketWindow {
  if (plan.source === "activities") {
    return { bucketSeconds: plan.bucketSeconds, bucketCount: plan.bucketCount };
  }
  return { bucketSeconds: DAY_SECONDS, bucketCount: plan.days };
}

const SPAN_CTE = `
  now_bucket AS (
    SELECT (floor(extract(epoch FROM now()) / $1::bigint) * $1::bigint)::bigint AS last_start
  ),
  span AS (
    SELECT last_start,
           CASE WHEN $2::int IS NULL THEN NULL::bigint
                ELSE last_start - $1::bigint * ($2::int - 1) END AS first_start
    FROM now_bucket
  )`;

const IN_WINDOW = `((SELECT first_start FROM span) IS NULL
       OR ${OBSERVED_AT} >= to_timestamp((SELECT first_start FROM span)))`;
const VOLUME_LEG = "a.event_role IN ('swap','bridge_deposit')";

const LISTED_LEGS_CTE = `
  legs AS (
    SELECT a.id AS activity_id, a.chain_family, a.chain_id,
           lower(a.token_in_address) AS address, a.token_in_symbol AS symbol,
           a.protocol, a.agent_hash, ${serverPricedUsdIn("a")} AS usd, ${OBSERVED_AT} AS observed_at
    FROM activities a
    WHERE a.verification_state IN ${VERIFIED_STATES}
      AND ${VOLUME_LEG}
      AND lower(a.token_in_address) IS NOT NULL
      AND ${IN_WINDOW}
    UNION ALL
    SELECT a.id, a.chain_family, a.chain_id,
           lower(a.token_out_address), a.token_out_symbol,
           a.protocol, a.agent_hash, ${serverPricedUsdOut("a")}, ${OBSERVED_AT}
    FROM activities a
    WHERE a.verification_state IN ${VERIFIED_STATES}
      AND ${VOLUME_LEG}
      AND lower(a.token_out_address) IS NOT NULL
      AND ${IN_WINDOW}
  )`;

const TOKEN_LEGS_CTE = `
  legs AS (
    SELECT a.id AS activity_id, a.token_in_symbol AS symbol, a.token_in_decimals AS decimals,
           a.protocol, a.agent_hash, ${serverPricedUsdIn("a")} AS usd, ${OBSERVED_AT} AS observed_at
    FROM activities a
    WHERE a.verification_state IN ${VERIFIED_STATES}
      AND ${VOLUME_LEG}
      AND a.chain_family = $3 AND a.chain_id = $4::bigint
      AND lower(a.token_in_address) = $5
      AND ${IN_WINDOW}
    UNION ALL
    SELECT a.id, a.token_out_symbol, a.token_out_decimals,
           a.protocol, a.agent_hash, ${serverPricedUsdOut("a")}, ${OBSERVED_AT}
    FROM activities a
    WHERE a.verification_state IN ${VERIFIED_STATES}
      AND ${VOLUME_LEG}
      AND a.chain_family = $3 AND a.chain_id = $4::bigint
      AND lower(a.token_out_address) = $5
      AND ${IN_WINDOW}
  )`;

export type TokenSeriesPointRead = { bucketStart: number; volumeUsd: string; txCount: number };

export type TokenStatRead = {
  chainFamily: string;
  chainId: bigint;
  address: string;
  symbol: string | null;
  volumeUsd: string;
  txCount: number;
  agentCount: number;
  protocols: string[];
  lastSeenSeconds: number;
  series: TokenSeriesPointRead[];
};

type TokenStatQueryRow = {
  chain_family: string;
  chain_id: string;
  address: string;
  symbol: string | null;
  volume_usd: string;
  tx_count: number;
  agent_count: number;
  protocols: string[];
  last_seen_seconds: number;
};

const SPARKLINE_BUCKET_COUNT = 7;

const SPARKLINE_WINDOW = `${OBSERVED_AT} >= to_timestamp((SELECT first_start FROM sparkline_span))`;

const SPARKLINE_LEG_JOIN = `FROM listed t
     JOIN activities a ON a.chain_family = t.chain_family AND a.chain_id = t.chain_id`;

type TokenSeriesQueryRow = {
  chain_family: string;
  chain_id: string;
  address: string;
  bucket_start: string;
  volume_usd: string;
  tx_count: number;
};

function sparklineKey(chainFamily: string, chainId: string, address: string): string {
  return `${chainFamily}:${chainId}:${address}`;
}

async function sparklineSeries(
  pool: pg.Pool,
  listed: TokenStatQueryRow[],
): Promise<Map<string, TokenSeriesPointRead[]>> {
  const result = await pool.query<TokenSeriesQueryRow>(
    `WITH listed AS (
       SELECT k.chain_family, k.chain_id::bigint AS chain_id, k.address
       FROM unnest($1::text[], $2::text[], $3::text[]) AS k(chain_family, chain_id, address)
     ),
     sparkline_span AS (
       SELECT last_start, last_start - $4::bigint * ($5::int - 1) AS first_start
       FROM (SELECT (floor(extract(epoch FROM now()) / $4::bigint) * $4::bigint)::bigint AS last_start) latest
     ),
     buckets AS (
       SELECT generate_series(first_start, last_start, $4::bigint) AS bucket_start FROM sparkline_span
     ),
     legs AS (
       SELECT a.id AS activity_id, t.chain_family, t.chain_id, t.address,
              ${serverPricedUsdIn("a")} AS usd, ${OBSERVED_AT} AS observed_at
       ${SPARKLINE_LEG_JOIN} AND lower(a.token_in_address) = t.address
       WHERE a.verification_state IN ${VERIFIED_STATES}
         AND ${VOLUME_LEG}
         AND ${SPARKLINE_WINDOW}
       UNION ALL
       SELECT a.id, t.chain_family, t.chain_id, t.address,
              ${serverPricedUsdOut("a")}, ${OBSERVED_AT}
       ${SPARKLINE_LEG_JOIN} AND lower(a.token_out_address) = t.address
       WHERE a.verification_state IN ${VERIFIED_STATES}
         AND ${VOLUME_LEG}
         AND ${SPARKLINE_WINDOW}
     ),
     bucketed AS (
       SELECT l.chain_family, l.chain_id, l.address,
              (floor(extract(epoch FROM l.observed_at) / $4::bigint) * $4::bigint)::bigint AS bucket_start,
              SUM(l.usd) AS volume_usd,
              COUNT(DISTINCT l.activity_id)::int AS tx_count
       FROM legs l
       GROUP BY 1, 2, 3, 4
     )
     SELECT t.chain_family,
            t.chain_id::text AS chain_id,
            t.address,
            b.bucket_start::text AS bucket_start,
            COALESCE(x.volume_usd, 0)::text AS volume_usd,
            COALESCE(x.tx_count, 0)::int AS tx_count
     FROM listed t
     CROSS JOIN buckets b
     LEFT JOIN bucketed x ON x.chain_family = t.chain_family AND x.chain_id = t.chain_id
                         AND x.address = t.address AND x.bucket_start = b.bucket_start
     ORDER BY t.chain_family, t.chain_id, t.address, b.bucket_start`,
    [
      listed.map((row) => row.chain_family),
      listed.map((row) => row.chain_id),
      listed.map((row) => row.address),
      DAY_SECONDS,
      SPARKLINE_BUCKET_COUNT,
    ],
  );
  const byToken = new Map<string, TokenSeriesPointRead[]>();
  for (const row of result.rows) {
    const key = sparklineKey(row.chain_family, row.chain_id, row.address);
    const points = byToken.get(key) ?? [];
    points.push({
      bucketStart: Number(row.bucket_start),
      volumeUsd: row.volume_usd,
      txCount: row.tx_count,
    });
    byToken.set(key, points);
  }
  return byToken;
}

export async function tokenListing(
  pool: pg.Pool,
  plan: ChartRangePlan,
  limit: number,
): Promise<TokenStatRead[]> {
  const window = bucketWindowOf(plan);
  const result = await pool.query<TokenStatQueryRow>(
    `WITH ${SPAN_CTE},
     ${LISTED_LEGS_CTE}
     SELECT l.chain_family,
            l.chain_id::text AS chain_id,
            l.address,
            mode() WITHIN GROUP (ORDER BY l.symbol) AS symbol,
            COALESCE(SUM(l.usd), 0)::text AS volume_usd,
            COUNT(DISTINCT l.activity_id)::int AS tx_count,
            COUNT(DISTINCT l.agent_hash)::int AS agent_count,
            array_agg(DISTINCT l.protocol ORDER BY l.protocol) AS protocols,
            GREATEST(0, floor(extract(epoch FROM now() - MAX(l.observed_at))))::int AS last_seen_seconds
     FROM legs l
     GROUP BY l.chain_family, l.chain_id, l.address
     ORDER BY COALESCE(SUM(l.usd), 0) DESC, COUNT(DISTINCT l.activity_id) DESC, l.address
     LIMIT $3`,
    [window.bucketSeconds, window.bucketCount, limit],
  );
  if (result.rows.length === 0) return [];
  const series = await sparklineSeries(pool, result.rows);
  return result.rows.map((row) => ({
    chainFamily: row.chain_family,
    chainId: BigInt(row.chain_id),
    address: row.address,
    symbol: row.symbol,
    volumeUsd: row.volume_usd,
    txCount: row.tx_count,
    agentCount: row.agent_count,
    protocols: row.protocols,
    lastSeenSeconds: row.last_seen_seconds,
    series: series.get(sparklineKey(row.chain_family, row.chain_id, row.address)) ?? [],
  }));
}

export type TokenChainCandidateRead = {
  chainFamily: string;
  chainId: bigint;
  protocols: string[];
};

export async function tokenChainCandidates(
  pool: pg.Pool,
  address: string,
): Promise<TokenChainCandidateRead[]> {
  const result = await pool.query<{ chain_family: string; chain_id: string; protocols: string[] }>(
    `SELECT a.chain_family,
            a.chain_id::text AS chain_id,
            array_agg(DISTINCT a.protocol ORDER BY a.protocol) AS protocols
     FROM activities a
     WHERE a.verification_state IN ${VERIFIED_STATES}
       AND (lower(a.token_in_address) = $1 OR lower(a.token_out_address) = $1)
     GROUP BY a.chain_family, a.chain_id`,
    [address],
  );
  return result.rows.map((row) => ({
    chainFamily: row.chain_family,
    chainId: BigInt(row.chain_id),
    protocols: row.protocols,
  }));
}

export type TokenKey = { chainFamily: string; chainId: bigint; address: string };

export type TokenProtocolRead = { protocol: string; volumeUsd: string; txCount: number };

export type TokenPairRead = {
  tokenInSymbol: string | null;
  tokenOutSymbol: string | null;
  txCount: number;
};

export type TokenDetailRead = {
  symbol: string | null;
  decimals: number | null;
  volumeUsd: string;
  txCount: number;
  agentCount: number;
  protocols: TokenProtocolRead[];
  pairs: TokenPairRead[];
  series: TokenSeriesPointRead[];
};

type TokenTotalsQueryRow = {
  symbol: string | null;
  decimals: number | null;
  volume_usd: string;
  tx_count: number;
  agent_count: number;
};

type TokenTotalsRead = {
  symbol: string | null;
  decimals: number | null;
  volumeUsd: string;
  txCount: number;
  agentCount: number;
};

function tokenParamsOf(window: BucketWindow, key: TokenKey): unknown[] {
  return [window.bucketSeconds, window.bucketCount, key.chainFamily, key.chainId.toString(), key.address];
}

async function tokenTotals(
  pool: pg.Pool,
  window: BucketWindow,
  key: TokenKey,
): Promise<TokenTotalsRead> {
  const result = await pool.query<TokenTotalsQueryRow>(
    `WITH ${SPAN_CTE},
     ${TOKEN_LEGS_CTE}
     SELECT mode() WITHIN GROUP (ORDER BY l.symbol) AS symbol,
            mode() WITHIN GROUP (ORDER BY l.decimals) AS decimals,
            COALESCE(SUM(l.usd), 0)::text AS volume_usd,
            COUNT(DISTINCT l.activity_id)::int AS tx_count,
            COUNT(DISTINCT l.agent_hash)::int AS agent_count
     FROM legs l`,
    tokenParamsOf(window, key),
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("token totals query returned no rows");
  return {
    symbol: row.symbol,
    decimals: row.decimals,
    volumeUsd: row.volume_usd,
    txCount: row.tx_count,
    agentCount: row.agent_count,
  };
}

async function tokenProtocols(
  pool: pg.Pool,
  window: BucketWindow,
  key: TokenKey,
): Promise<TokenProtocolRead[]> {
  const result = await pool.query<{ protocol: string; volume_usd: string; tx_count: number }>(
    `WITH ${SPAN_CTE},
     ${TOKEN_LEGS_CTE}
     SELECT l.protocol,
            COALESCE(SUM(l.usd), 0)::text AS volume_usd,
            COUNT(DISTINCT l.activity_id)::int AS tx_count
     FROM legs l
     GROUP BY l.protocol
     ORDER BY COALESCE(SUM(l.usd), 0) DESC, l.protocol`,
    tokenParamsOf(window, key),
  );
  return result.rows.map((row) => ({
    protocol: row.protocol,
    volumeUsd: row.volume_usd,
    txCount: row.tx_count,
  }));
}

async function tokenPairs(
  pool: pg.Pool,
  window: BucketWindow,
  key: TokenKey,
  panelRows: number,
): Promise<TokenPairRead[]> {
  const result = await pool.query<{
    token_in_symbol: string | null;
    token_out_symbol: string | null;
    tx_count: number;
  }>(
    `WITH ${SPAN_CTE}
     SELECT a.token_in_symbol, a.token_out_symbol, COUNT(*)::int AS tx_count
     FROM activities a
     WHERE a.verification_state IN ${VERIFIED_STATES}
       AND a.chain_family = $3 AND a.chain_id = $4::bigint
       AND (lower(a.token_in_address) = $5 OR lower(a.token_out_address) = $5)
       AND ${IN_WINDOW}
     GROUP BY a.token_in_symbol, a.token_out_symbol
     ORDER BY COUNT(*) DESC, a.token_in_symbol, a.token_out_symbol
     LIMIT $6`,
    [...tokenParamsOf(window, key), panelRows],
  );
  return result.rows.map((row) => ({
    tokenInSymbol: row.token_in_symbol,
    tokenOutSymbol: row.token_out_symbol,
    txCount: row.tx_count,
  }));
}

async function tokenSeries(
  pool: pg.Pool,
  window: BucketWindow,
  key: TokenKey,
): Promise<TokenSeriesPointRead[]> {
  const result = await pool.query<{ bucket_start: string; volume_usd: string; tx_count: number }>(
    `WITH ${SPAN_CTE},
     ${TOKEN_LEGS_CTE},
     bucketed AS (
       SELECT (floor(extract(epoch FROM l.observed_at) / $1::bigint) * $1::bigint)::bigint AS bucket_start,
              SUM(l.usd) AS volume_usd,
              COUNT(DISTINCT l.activity_id)::int AS tx_count
       FROM legs l
       GROUP BY 1
     ),
     series_span AS (
       SELECT COALESCE((SELECT first_start FROM span),
                       (SELECT MIN(bucket_start) FROM bucketed),
                       (SELECT last_start FROM span)) AS first_start,
              (SELECT last_start FROM span) AS last_start
     ),
     points AS (
       SELECT generate_series((SELECT first_start FROM series_span),
                              (SELECT last_start FROM series_span),
                              $1::bigint) AS bucket_start
     )
     SELECT p.bucket_start::text AS bucket_start,
            COALESCE(b.volume_usd, 0)::text AS volume_usd,
            COALESCE(b.tx_count, 0)::int AS tx_count
     FROM points p
     LEFT JOIN bucketed b ON b.bucket_start = p.bucket_start
     ORDER BY p.bucket_start`,
    tokenParamsOf(window, key),
  );
  return result.rows.map((row) => ({
    bucketStart: Number(row.bucket_start),
    volumeUsd: row.volume_usd,
    txCount: row.tx_count,
  }));
}

export async function tokenDetail(
  pool: pg.Pool,
  plan: ChartRangePlan,
  key: TokenKey,
  panelRows: number,
): Promise<TokenDetailRead> {
  const window = bucketWindowOf(plan);
  const [totals, protocols, pairs, series] = await Promise.all([
    tokenTotals(pool, window, key),
    tokenProtocols(pool, window, key),
    tokenPairs(pool, window, key, panelRows),
    tokenSeries(pool, window, key),
  ]);
  return { ...totals, protocols, pairs, series };
}
