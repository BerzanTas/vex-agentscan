import type pg from "pg";
import type { ChainFamily, ChartRangePlan } from "@agentscan/core";
import { serverPricedUsdInSum, serverPricedUsdInSumOf } from "./server-priced-usd.js";

export type ActivityDbRow = {
  id: bigint;
  agent_hash: string;
  source_row_id: string;
  public_id: string;
  source_execution_id: string;
  event_index: number;
  kind: string;
  event_role: string;
  status: string;
  protocol: string;
  chain_family: string;
  chain_id: bigint;
  from_chain_id: bigint | null;
  to_chain_id: bigint | null;
  token_in_address: string | null;
  token_in_symbol: string | null;
  token_in_decimals: number | null;
  token_out_address: string | null;
  token_out_symbol: string | null;
  token_out_decimals: number | null;
  amount_in_raw: string | null;
  amount_out_raw: string | null;
  executed_in_raw: string | null;
  executed_out_raw: string | null;
  usd_in_est: string | null;
  usd_out_est: string | null;
  usd_fee_est: string | null;
  usd_source: string | null;
  tx_hash: string | null;
  failure_code: string | null;
  client_created_at: Date;
  client_confirmed_at: Date | null;
  client_observed_at: Date | null;
  statuses_seen: string[];
  verification_state: string;
  verified_at: Date | null;
  backfill: boolean;
  received_at: Date;
  received_schema_version: number;
};

export type FeedCursor = { receivedAt: Date; id: bigint };

type ActivityQueryRow = Omit<ActivityDbRow, "id" | "chain_id" | "from_chain_id" | "to_chain_id"> & {
  id: string;
  chain_id: string;
  from_chain_id: string | null;
  to_chain_id: string | null;
};

const ACTIVITY_COLUMNS = `
  a.id, a.agent_hash, a.source_row_id, a.public_id, a.source_execution_id, a.event_index,
  a.kind, a.event_role, a.status, a.protocol, a.chain_family, a.chain_id, a.from_chain_id, a.to_chain_id,
  a.token_in_address, a.token_in_symbol, a.token_in_decimals,
  a.token_out_address, a.token_out_symbol, a.token_out_decimals,
  a.amount_in_raw, a.amount_out_raw, a.executed_in_raw, a.executed_out_raw,
  a.usd_in_est, a.usd_out_est, a.usd_fee_est, a.usd_source,
  a.tx_hash, a.failure_code,
  a.client_created_at, a.client_confirmed_at, a.client_observed_at,
  a.statuses_seen, a.verification_state, a.verified_at, a.backfill, a.received_at, a.received_schema_version`;

const VISIBILITY_PREDICATE = `(
  a.verification_state IN ('verified_full','verified_basic')
  OR (a.verification_state IN ('none','queued') AND ag.first_verified_at IS NOT NULL)
)`;

function activityDbRowFrom(raw: ActivityQueryRow): ActivityDbRow {
  return {
    id: BigInt(raw.id),
    agent_hash: raw.agent_hash,
    source_row_id: raw.source_row_id,
    public_id: raw.public_id,
    source_execution_id: raw.source_execution_id,
    event_index: raw.event_index,
    kind: raw.kind,
    event_role: raw.event_role,
    status: raw.status,
    protocol: raw.protocol,
    chain_family: raw.chain_family,
    chain_id: BigInt(raw.chain_id),
    from_chain_id: raw.from_chain_id === null ? null : BigInt(raw.from_chain_id),
    to_chain_id: raw.to_chain_id === null ? null : BigInt(raw.to_chain_id),
    token_in_address: raw.token_in_address,
    token_in_symbol: raw.token_in_symbol,
    token_in_decimals: raw.token_in_decimals,
    token_out_address: raw.token_out_address,
    token_out_symbol: raw.token_out_symbol,
    token_out_decimals: raw.token_out_decimals,
    amount_in_raw: raw.amount_in_raw,
    amount_out_raw: raw.amount_out_raw,
    executed_in_raw: raw.executed_in_raw,
    executed_out_raw: raw.executed_out_raw,
    usd_in_est: raw.usd_in_est,
    usd_out_est: raw.usd_out_est,
    usd_fee_est: raw.usd_fee_est,
    usd_source: raw.usd_source,
    tx_hash: raw.tx_hash,
    failure_code: raw.failure_code,
    client_created_at: raw.client_created_at,
    client_confirmed_at: raw.client_confirmed_at,
    client_observed_at: raw.client_observed_at,
    statuses_seen: raw.statuses_seen,
    verification_state: raw.verification_state,
    verified_at: raw.verified_at,
    backfill: raw.backfill,
    received_at: raw.received_at,
    received_schema_version: raw.received_schema_version,
  };
}

function singleRow<T extends pg.QueryResultRow>(result: pg.QueryResult<T>): T {
  const row = result.rows[0];
  if (row === undefined) throw new Error("aggregate query returned no rows");
  return row;
}

export type ActivityKindFilter = "swap" | "bridge";
export type ActivityStatusFilter = "pending" | "confirmed" | "definitively_failed";
export type ActivityVerificationFilter = "verified_full" | "verified_basic" | "pending";

export type ActivityFilters = {
  kind: ActivityKindFilter | null;
  protocol: string | null;
  chain: string | null;
  status: ActivityStatusFilter | null;
  verification: ActivityVerificationFilter | null;
};

export type RawActivityFilters = { [Dimension in keyof ActivityFilters]?: unknown };

const ACTIVITY_KIND_FILTERS: readonly ActivityKindFilter[] = ["swap", "bridge"];
const ACTIVITY_STATUS_FILTERS: readonly ActivityStatusFilter[] = [
  "pending",
  "confirmed",
  "definitively_failed",
];
const ACTIVITY_VERIFICATION_FILTERS: readonly ActivityVerificationFilter[] = [
  "verified_full",
  "verified_basic",
  "pending",
];

const VERIFICATION_FILTER_STATES: Record<ActivityVerificationFilter, string[]> = {
  verified_full: ["verified_full"],
  verified_basic: ["verified_basic"],
  pending: ["none", "queued"],
};

function trimmedText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

function offeredValue<Value extends string>(offered: readonly Value[], raw: unknown): Value | null {
  const text = trimmedText(raw);
  return offered.find((value) => value === text) ?? null;
}

export function parseActivityFilters(raw: RawActivityFilters): ActivityFilters {
  return {
    kind: offeredValue(ACTIVITY_KIND_FILTERS, raw.kind),
    protocol: trimmedText(raw.protocol),
    chain: trimmedText(raw.chain),
    status: offeredValue(ACTIVITY_STATUS_FILTERS, raw.status),
    verification: offeredValue(ACTIVITY_VERIFICATION_FILTERS, raw.verification),
  };
}

export type ChainFilterPair = { chainFamily: ChainFamily; chainId: bigint };

export type ChainFilterPairs = [ChainFilterPair, ...ChainFilterPair[]];

export type ActivityFeedQuery = {
  cursor: FeedCursor | null;
  limit: number;
  kind: ActivityKindFilter | null;
  protocol: string | null;
  chainPairs: ChainFilterPairs | null;
  status: ActivityStatusFilter | null;
  verification: ActivityVerificationFilter | null;
};

type BindParam = (value: unknown) => string;

function chainPairsPredicate(pairs: ChainFilterPairs, bind: BindParam): string {
  const matches = pairs.map(
    (pair) => `(a.chain_family = ${bind(pair.chainFamily)} AND a.chain_id = ${bind(pair.chainId.toString())}::bigint)`,
  );
  return `(${matches.join(" OR ")})`;
}

function feedFilterPredicates(query: ActivityFeedQuery, bind: BindParam): string[] {
  const predicates: string[] = [];
  if (query.kind !== null) predicates.push(`a.kind = ${bind(query.kind)}`);
  if (query.protocol !== null) predicates.push(`a.protocol = ${bind(query.protocol)}`);
  if (query.status !== null) predicates.push(`a.status = ${bind(query.status)}`);
  if (query.verification !== null) {
    predicates.push(
      `a.verification_state = ANY(${bind(VERIFICATION_FILTER_STATES[query.verification])}::text[])`,
    );
  }
  if (query.chainPairs !== null) predicates.push(chainPairsPredicate(query.chainPairs, bind));
  return predicates;
}

export async function visibleActivityPage(
  pool: pg.Pool,
  query: ActivityFeedQuery,
): Promise<ActivityDbRow[]> {
  const params: unknown[] = [
    query.cursor?.receivedAt ?? null,
    query.cursor?.id.toString() ?? null,
    query.limit,
  ];
  const bind: BindParam = (value) => `$${params.push(value)}`;
  const filterSql = feedFilterPredicates(query, bind)
    .map((predicate) => `AND ${predicate}`)
    .join("\n       ");
  const result = await pool.query<ActivityQueryRow>(
    `SELECT ${ACTIVITY_COLUMNS}
     FROM activities a
     JOIN agents ag ON ag.agent_hash = a.agent_hash
     WHERE ${VISIBILITY_PREDICATE}
       AND ($1::timestamptz IS NULL OR (a.received_at, a.id) < ($1::timestamptz, $2::bigint))
       ${filterSql}
     ORDER BY a.received_at DESC, a.id DESC
     LIMIT $3`,
    params,
  );
  return result.rows.map(activityDbRowFrom);
}

export async function visibleActivityByPublicId(
  pool: pg.Pool,
  publicId: string,
): Promise<ActivityDbRow | null> {
  const result = await pool.query<ActivityQueryRow>(
    `SELECT ${ACTIVITY_COLUMNS}
     FROM activities a
     JOIN agents ag ON ag.agent_hash = a.agent_hash
     WHERE a.public_id = $1 AND ${VISIBILITY_PREDICATE}
     LIMIT 1`,
    [publicId],
  );
  const raw = result.rows[0];
  return raw === undefined ? null : activityDbRowFrom(raw);
}

function txHashCandidatesOf(query: string): string[] {
  const lowered = query.toLowerCase();
  return lowered.startsWith("0x") ? [lowered, lowered.slice(2)] : [lowered, `0x${lowered}`];
}

export async function lookupPublicId(pool: pg.Pool, query: string): Promise<string | null> {
  const result = await pool.query<{ public_id: string }>(
    `SELECT a.public_id
     FROM activities a
     JOIN agents ag ON ag.agent_hash = a.agent_hash
     WHERE ${VISIBILITY_PREDICATE}
       AND (a.public_id = $1 OR lower(a.tx_hash) = ANY($2::text[]))
     LIMIT 1`,
    [query, txHashCandidatesOf(query)],
  );
  return result.rows[0]?.public_id ?? null;
}

export type AggregateTotals = {
  dailyVolumeUsd: string;
  totalVolumeUsd: string;
  dailyTx: number;
  totalTx: number;
};

export async function aggregateTotals(pool: pg.Pool): Promise<AggregateTotals> {
  const result = await pool.query<{
    daily_volume_usd: string;
    total_volume_usd: string;
    daily_tx: number;
    total_tx: number;
  }>(
    `WITH priced_by_day AS (${PRICED_VOLUME_BY_UTC_DAY}),
     counted AS (
       SELECT
         COALESCE(SUM(tx_count) FILTER (WHERE day = ${CURRENT_UTC_DAY}), 0)::int AS daily_tx,
         COALESCE(SUM(tx_count), 0)::int AS total_tx
       FROM daily_aggregates
     )
     SELECT
       (SELECT COALESCE(SUM(volume_usd) FILTER (WHERE day = ${CURRENT_UTC_DAY}), 0)::text
        FROM priced_by_day) AS daily_volume_usd,
       (SELECT COALESCE(SUM(volume_usd), 0)::text FROM priced_by_day) AS total_volume_usd,
       daily_tx,
       total_tx
     FROM counted`,
  );
  const row = singleRow(result);
  return {
    dailyVolumeUsd: row.daily_volume_usd,
    totalVolumeUsd: row.total_volume_usd,
    dailyTx: row.daily_tx,
    totalTx: row.total_tx,
  };
}

export async function countActiveAgents7d(pool: pg.Pool): Promise<number> {
  const result = await pool.query<{ active_agents: number }>(
    `SELECT COUNT(DISTINCT agent_hash)::int AS active_agents
     FROM activities
     WHERE verification_state IN ('verified_full','verified_basic')
       AND client_confirmed_at > now() - interval '7 days'`,
  );
  return singleRow(result).active_agents;
}

export type ChartBucketRead = { bucketStart: number; volumeUsd: string; txCount: number };

type ChartBucketQueryRow = { bucket_start: string; volume_usd: string; tx_count: number };

const VERIFIED_VOLUME_ROLES = "('swap','bridge_deposit')";
const ACTIVITY_TIME_ANCHOR = "COALESCE(a.client_confirmed_at, a.verified_at)";
const VERIFIED_STATES_PREDICATE = "a.verification_state IN ('verified_full','verified_basic')";
const VOLUME_LEG_PREDICATE = `a.event_role IN ${VERIFIED_VOLUME_ROLES}`;
const VOLUME_LEG_USD_SUM = serverPricedUsdInSumOf("a", VOLUME_LEG_PREDICATE);
const UTC_DAY_OF_ANCHOR = `(${ACTIVITY_TIME_ANCHOR} AT TIME ZONE 'utc')::date`;
const CURRENT_UTC_DAY = "(now() AT TIME ZONE 'utc')::date";

const PRICED_VOLUME_BY_UTC_DAY = `
  SELECT ${UTC_DAY_OF_ANCHOR} AS day, ${serverPricedUsdInSum("a")} AS volume_usd
  FROM activities a
  WHERE ${VERIFIED_STATES_PREDICATE}
    AND ${VOLUME_LEG_PREDICATE}
  GROUP BY 1`;

function chartBucketFrom(row: ChartBucketQueryRow): ChartBucketRead {
  return {
    bucketStart: Number(row.bucket_start),
    volumeUsd: row.volume_usd,
    txCount: row.tx_count,
  };
}

async function bucketsFromActivities(
  pool: pg.Pool,
  bucketSeconds: number,
  bucketCount: number,
): Promise<ChartBucketRead[]> {
  const result = await pool.query<ChartBucketQueryRow>(
    `WITH latest AS (
       SELECT (floor(extract(epoch FROM now()) / $1::bigint) * $1::bigint)::bigint AS bucket_start
     ),
     span AS (
       SELECT bucket_start AS last_start,
              bucket_start - $1::bigint * ($2::int - 1) AS first_start
       FROM latest
     ),
     series AS (
       SELECT generate_series(first_start, last_start, $1::bigint) AS bucket_start FROM span
     ),
     bucketed AS (
       SELECT (floor(extract(epoch FROM COALESCE(a.client_confirmed_at, a.verified_at)) / $1::bigint)
                 * $1::bigint)::bigint AS bucket_start,
              ${serverPricedUsdInSumOf("a", VOLUME_LEG_PREDICATE)} AS volume_usd,
              COUNT(*)::int AS tx_count
       FROM activities a
       WHERE a.verification_state IN ('verified_full','verified_basic')
         AND COALESCE(a.client_confirmed_at, a.verified_at) >= to_timestamp((SELECT first_start FROM span))
       GROUP BY 1
     )
     SELECT s.bucket_start::text AS bucket_start,
            COALESCE(b.volume_usd, 0)::text AS volume_usd,
            COALESCE(b.tx_count, 0)::int AS tx_count
     FROM series s
     LEFT JOIN bucketed b ON b.bucket_start = s.bucket_start
     ORDER BY s.bucket_start`,
    [bucketSeconds, bucketCount],
  );
  return result.rows.map(chartBucketFrom);
}

async function bucketsFromAggregates(pool: pg.Pool, days: number | null): Promise<ChartBucketRead[]> {
  const result = await pool.query<ChartBucketQueryRow>(
    `WITH bounds AS (
       SELECT COALESCE(
                CASE WHEN $1::int IS NULL THEN (SELECT MIN(day) FROM daily_aggregates)
                     ELSE (now() AT TIME ZONE 'utc')::date - ($1::int - 1) END,
                (now() AT TIME ZONE 'utc')::date
              ) AS first_day
     ),
     series AS (
       SELECT generate_series((SELECT first_day FROM bounds)::timestamp,
                              (now() AT TIME ZONE 'utc')::date::timestamp,
                              interval '1 day')::date AS day
     ),
     counted AS (
       SELECT day, SUM(tx_count)::int AS tx_count
       FROM daily_aggregates
       GROUP BY day
     ),
     priced_by_day AS (${PRICED_VOLUME_BY_UTC_DAY})
     SELECT extract(epoch FROM s.day::timestamp AT TIME ZONE 'utc')::bigint::text AS bucket_start,
            COALESCE(p.volume_usd, 0)::text AS volume_usd,
            COALESCE(c.tx_count, 0)::int AS tx_count
     FROM series s
     LEFT JOIN counted c ON c.day = s.day
     LEFT JOIN priced_by_day p ON p.day = s.day
     ORDER BY s.day`,
    [days],
  );
  return result.rows.map(chartBucketFrom);
}

export async function chartBuckets(pool: pg.Pool, plan: ChartRangePlan): Promise<ChartBucketRead[]> {
  if (plan.source === "activities") {
    return bucketsFromActivities(pool, plan.bucketSeconds, plan.bucketCount);
  }
  return bucketsFromAggregates(pool, plan.days);
}

const USD_IN_SUM = serverPricedUsdInSum("a");
const DISTINCT_CHAIN_COUNT = "COUNT(DISTINCT (a.chain_family, a.chain_id))::int";

function windowPredicate(paramIndex: number): string {
  const seconds = `$${paramIndex}::int`;
  return `(${seconds} IS NULL OR ${ACTIVITY_TIME_ANCHOR} > now() - make_interval(secs => ${seconds}))`;
}

export type AgentVolumeRead = {
  agentHash: string;
  volumeUsd: string;
  txCount: number;
  protocolCount: number;
  chainCount: number;
  lastSeenSeconds: number;
};

export async function agentLeaderboard(
  pool: pg.Pool,
  windowSeconds: number | null,
): Promise<AgentVolumeRead[]> {
  const result = await pool.query<{
    agent_hash: string;
    volume_usd: string;
    tx_count: number;
    protocol_count: number;
    chain_count: number;
    last_seen_seconds: number;
  }>(
    `SELECT a.agent_hash,
            ${USD_IN_SUM}::text AS volume_usd,
            COUNT(*)::int AS tx_count,
            COUNT(DISTINCT a.protocol)::int AS protocol_count,
            ${DISTINCT_CHAIN_COUNT} AS chain_count,
            GREATEST(0, floor(extract(epoch FROM
              now() - COALESCE(MAX(${ACTIVITY_TIME_ANCHOR}), MAX(a.received_at)))))::int AS last_seen_seconds
     FROM activities a
     WHERE ${VERIFIED_STATES_PREDICATE}
       AND a.event_role IN ${VERIFIED_VOLUME_ROLES}
       AND ${windowPredicate(1)}
     GROUP BY a.agent_hash
     ORDER BY ${USD_IN_SUM} DESC, a.agent_hash
     LIMIT 10`,
    [windowSeconds],
  );
  return result.rows.map((row) => ({
    agentHash: row.agent_hash,
    volumeUsd: row.volume_usd,
    txCount: row.tx_count,
    protocolCount: row.protocol_count,
    chainCount: row.chain_count,
    lastSeenSeconds: row.last_seen_seconds,
  }));
}

export type ProtocolRead = { protocol: string; volumeUsd: string; txCount: number };

export type ProtocolRankingRead = ProtocolRead & {
  chainCount: number;
  swapTxCount: number;
  bridgeTxCount: number;
};

export async function protocolTotals(pool: pg.Pool): Promise<ProtocolRead[]> {
  const result = await pool.query<{ protocol: string; volume_usd: string; tx_count: number }>(
    `WITH counted AS (
       SELECT protocol, SUM(tx_count)::int AS tx_count
       FROM daily_aggregates
       GROUP BY protocol
     ),
     priced AS (
       SELECT a.protocol, ${VOLUME_LEG_USD_SUM} AS volume_usd
       FROM activities a
       WHERE ${VERIFIED_STATES_PREDICATE}
       GROUP BY a.protocol
     )
     SELECT c.protocol,
            COALESCE(p.volume_usd, 0)::text AS volume_usd,
            c.tx_count
     FROM counted c
     LEFT JOIN priced p ON p.protocol = c.protocol
     ORDER BY COALESCE(p.volume_usd, 0) DESC, c.protocol`,
  );
  return result.rows.map((row) => ({
    protocol: row.protocol,
    volumeUsd: row.volume_usd,
    txCount: row.tx_count,
  }));
}

export async function protocolRanking(
  pool: pg.Pool,
  windowSeconds: number | null,
): Promise<ProtocolRankingRead[]> {
  const result = await pool.query<{
    protocol: string;
    volume_usd: string;
    tx_count: number;
    chain_count: number;
    swap_tx_count: number;
    bridge_tx_count: number;
  }>(
    `SELECT a.protocol,
            ${VOLUME_LEG_USD_SUM}::text AS volume_usd,
            COUNT(*)::int AS tx_count,
            ${DISTINCT_CHAIN_COUNT} AS chain_count,
            (COUNT(*) FILTER (WHERE a.kind = 'swap'))::int AS swap_tx_count,
            (COUNT(*) FILTER (WHERE a.kind = 'bridge'))::int AS bridge_tx_count
     FROM activities a
     WHERE ${VERIFIED_STATES_PREDICATE}
       AND ${windowPredicate(1)}
     GROUP BY a.protocol
     ORDER BY ${VOLUME_LEG_USD_SUM} DESC, a.protocol`,
    [windowSeconds],
  );
  return result.rows.map((row) => ({
    protocol: row.protocol,
    volumeUsd: row.volume_usd,
    txCount: row.tx_count,
    chainCount: row.chain_count,
    swapTxCount: row.swap_tx_count,
    bridgeTxCount: row.bridge_tx_count,
  }));
}

export type PricingCoverageRead = {
  pricedActivityCount: number;
  unpricedActivityCount: number;
  pendingActivityCount: number;
};

type PricingState = "server_priced" | "unpriced" | "pending";

function pricingStateCount(state: PricingState): string {
  return `COUNT(*) FILTER (WHERE a.pricing_state = '${state}')::int`;
}

export async function pricingCoverage(
  pool: pg.Pool,
  windowSeconds: number | null,
): Promise<PricingCoverageRead> {
  const result = await pool.query<{
    priced_activity_count: number;
    unpriced_activity_count: number;
    pending_activity_count: number;
  }>(
    `SELECT ${pricingStateCount("server_priced")} AS priced_activity_count,
            ${pricingStateCount("unpriced")} AS unpriced_activity_count,
            ${pricingStateCount("pending")} AS pending_activity_count
     FROM activities a
     WHERE ${VERIFIED_STATES_PREDICATE}
       AND ${windowPredicate(1)}`,
    [windowSeconds],
  );
  const row = singleRow(result);
  return {
    pricedActivityCount: row.priced_activity_count,
    unpricedActivityCount: row.unpriced_activity_count,
    pendingActivityCount: row.pending_activity_count,
  };
}
