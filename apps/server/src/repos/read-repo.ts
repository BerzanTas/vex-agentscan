import type pg from "pg";
import type { ChartRangePlan } from "@agentscan/core";

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

export async function visibleActivityPage(
  pool: pg.Pool,
  cursor: FeedCursor | null,
  limit: number,
): Promise<ActivityDbRow[]> {
  const result = await pool.query<ActivityQueryRow>(
    `SELECT ${ACTIVITY_COLUMNS}
     FROM activities a
     JOIN agents ag ON ag.agent_hash = a.agent_hash
     WHERE ${VISIBILITY_PREDICATE}
       AND ($1::timestamptz IS NULL OR (a.received_at, a.id) < ($1::timestamptz, $2::bigint))
     ORDER BY a.received_at DESC, a.id DESC
     LIMIT $3`,
    [cursor?.receivedAt ?? null, cursor?.id.toString() ?? null, limit],
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
    `SELECT
       COALESCE(SUM(volume_usd) FILTER (WHERE day = (now() AT TIME ZONE 'utc')::date), 0)::text AS daily_volume_usd,
       COALESCE(SUM(volume_usd), 0)::text AS total_volume_usd,
       COALESCE(SUM(tx_count) FILTER (WHERE day = (now() AT TIME ZONE 'utc')::date), 0)::int AS daily_tx,
       COALESCE(SUM(tx_count), 0)::int AS total_tx
     FROM daily_aggregates`,
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
              SUM(CASE WHEN a.event_role IN ${VERIFIED_VOLUME_ROLES}
                       THEN COALESCE(a.usd_in_est, 0) ELSE 0 END) AS volume_usd,
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
     summed AS (
       SELECT day, SUM(volume_usd) AS volume_usd, SUM(tx_count)::int AS tx_count
       FROM daily_aggregates
       GROUP BY day
     )
     SELECT extract(epoch FROM s.day::timestamp AT TIME ZONE 'utc')::bigint::text AS bucket_start,
            COALESCE(d.volume_usd, 0)::text AS volume_usd,
            COALESCE(d.tx_count, 0)::int AS tx_count
     FROM series s
     LEFT JOIN summed d ON d.day = s.day
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

export type AgentVolumeRead = { agentHash: string; volumeUsd: string; txCount: number };

export async function agentLeaderboard(pool: pg.Pool): Promise<AgentVolumeRead[]> {
  const result = await pool.query<{ agent_hash: string; volume_usd: string; tx_count: number }>(
    `SELECT agent_hash, COALESCE(SUM(usd_in_est), 0)::text AS volume_usd, COUNT(*)::int AS tx_count
     FROM activities
     WHERE verification_state IN ('verified_full','verified_basic')
       AND event_role IN ('swap','bridge_deposit')
       AND client_confirmed_at > now() - interval '30 days'
     GROUP BY agent_hash
     ORDER BY COALESCE(SUM(usd_in_est), 0) DESC
     LIMIT 10`,
  );
  return result.rows.map((row) => ({
    agentHash: row.agent_hash,
    volumeUsd: row.volume_usd,
    txCount: row.tx_count,
  }));
}

export type ProtocolRead = { protocol: string; volumeUsd: string; txCount: number };

export async function protocolRanking(pool: pg.Pool): Promise<ProtocolRead[]> {
  const result = await pool.query<{ protocol: string; volume_usd: string; tx_count: number }>(
    `SELECT protocol, SUM(volume_usd)::text AS volume_usd, SUM(tx_count)::int AS tx_count
     FROM daily_aggregates
     GROUP BY protocol
     ORDER BY SUM(volume_usd) DESC`,
  );
  return result.rows.map((row) => ({ protocol: row.protocol, volumeUsd: row.volume_usd, txCount: row.tx_count }));
}
