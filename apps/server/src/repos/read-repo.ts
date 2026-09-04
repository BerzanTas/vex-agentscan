import type pg from "pg";
import { EVENT_KINDS, EVENT_STATUSES, type EventKind, type EventStatus } from "@agentscan/contract";
import {
  capitalDeployingRolesIn,
  logicalRowIn,
  vexFeeLegRolesIn,
  type ChainFamily,
  type ChartRangePlan,
} from "@agentscan/core";
import { activityEventTimeCursorSql, activityTimeAnchorSql } from "./activity-time-anchor.js";
import {
  awaitingAPrice,
  contributesNoUsd,
  contributesUsd,
  serverPricedUsdInSum,
  serverPricedUsdInSumOf,
} from "./server-priced-usd.js";

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
  token_out2_symbol: string | null;
  token_out2_decimals: number | null;
  amount_out2_raw: string | null;
  executed_out2_raw: string | null;
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
  event_time: Date;
  vex_fee_amount_raw: string | null;
  vex_fee_decimals: number | null;
  vex_fee_symbol: string | null;
  vex_fee_tx_hash: string | null;
  vex_fee_status: string | null;
  vex_fee_usd_est: string | null;
  vex_fee_chain_family: string | null;
  vex_fee_chain_id: bigint | null;
};

export type FeedCursor = { eventTime: Date; id: bigint };

type ActivityQueryRow = Omit<
  ActivityDbRow,
  "id" | "chain_id" | "from_chain_id" | "to_chain_id" | "vex_fee_chain_id"
> & {
  id: string;
  chain_id: string;
  from_chain_id: string | null;
  to_chain_id: string | null;
  vex_fee_chain_id: string | null;
};

const ACTIVITY_EVENT_TIME = activityEventTimeCursorSql("a");

/**
 * THE VEX FEE, PROJECTED FROM ITS SEPARATE LEG ONTO THE ACTION IT CHARGES FOR.
 *
 * Vex takes its integrator fee as a native transfer of its own - a second on-chain transaction -
 * because the venues it charges on expose no integrator-fee parameter. The producer records that
 * transfer as a child leg of the same execution (`source_execution_id`, `event_index` 1). It is
 * part of the ACTION and never a second entry here, so the fee leg is excluded from every list and
 * count by `LOGICAL_ROW_PREDICATE` and reappears only through this projection, on its parent.
 *
 * ONE PARENT PER EXECUTION. The `NOT EXISTS` guard attaches the fee to the LOWEST-indexed non-fee
 * leg of the execution and to no other, which is the same parent `LOGICAL_ROW_ID` resolves a fee
 * leg's public id and hash to. Without it a bridge execution (deposit, fee, fill) and a Pendle
 * split (two mint legs, one fee) would each render the SAME charge twice, once under every non-fee
 * leg - the fold's whole purpose inverted into a double count.
 *
 * PENDING AND FAILED ATTEMPTS STAY VISIBLE, AND FEED NO MONEY FIELD (owner decision V1,
 * 2026-09-04). The lateral no longer filters on status, so a fee still in flight or one that
 * reverted appears under its action with `status` saying so; `vexFeeColumn` then blanks the amount
 * and the USD estimate for every status but `confirmed`, because an attempted charge is not a
 * charge. A confirmed retry after a failed attempt wins the ORDER BY, so the money is read from the
 * leg that actually settled. The parent's own status is never consulted: a fee that confirmed
 * against an action that then failed was still really charged.
 *
 * ONE SOURCE OF MONEY, AND THE ANOMALY FAILS CLOSED. Two CONFIRMED fee legs on one execution is a
 * producer defect; reporting one of them as if it were the whole charge would understate the money,
 * so `confirmed_leg_count > 1` blanks every field instead - the row reports no fee at all rather
 * than half of one.
 *
 * `activities.usd_vex_fee_est` - the column the producer uses for venues that take the fee INSIDE
 * the transaction, where it has no leg of its own - is deliberately NOT a second source here. This
 * site publishes no client-side cost estimate (`public-dto.test.ts` pins that, alongside the gas and
 * venue-fee columns), so there is no own-row value to double count against the leg.
 */
const VEX_FEE_LEG_LATERAL = `
     LEFT JOIN LATERAL (
       SELECT COALESCE(fee.executed_in_raw, fee.amount_in_raw) AS amount_raw,
              fee.token_in_decimals AS decimals,
              fee.token_in_symbol   AS symbol,
              fee.tx_hash           AS tx_hash,
              fee.status            AS status,
              fee.usd_in_est        AS usd_est,
              fee.chain_family      AS chain_family,
              fee.chain_id          AS chain_id,
              count(*) FILTER (WHERE fee.status = 'confirmed') OVER () AS confirmed_leg_count
         FROM activities fee
        WHERE fee.agent_hash = a.agent_hash
          AND fee.source_execution_id = a.source_execution_id
          AND fee.id <> a.id
          AND ${vexFeeLegRolesIn("fee.event_role")}
          AND NOT EXISTS (
                SELECT 1
                  FROM activities earlier
                 WHERE earlier.agent_hash = a.agent_hash
                   AND earlier.source_execution_id = a.source_execution_id
                   AND ${logicalRowIn("earlier.event_role")}
                   AND (earlier.event_index, earlier.id) < (a.event_index, a.id)
              )
        ORDER BY (fee.status = 'confirmed') DESC, fee.event_index DESC, fee.id DESC
        LIMIT 1
     ) vex_fee ON TRUE`;

/** Visible for every status the picked leg can be in, once the double-charge anomaly is ruled out. */
function vexFeeColumn(expression: string, alias: string): string {
  return `CASE WHEN vex_fee.confirmed_leg_count <= 1 THEN ${expression} END AS ${alias}`;
}

/** A money field: it states what Vex actually took, so only a CONFIRMED leg may fill it. */
function vexFeeMoneyColumn(expression: string, alias: string): string {
  return `CASE WHEN vex_fee.confirmed_leg_count <= 1 AND vex_fee.status = 'confirmed'
              THEN ${expression} END AS ${alias}`;
}

const VEX_FEE_COLUMNS = [
  vexFeeMoneyColumn("vex_fee.amount_raw", "vex_fee_amount_raw"),
  vexFeeMoneyColumn("vex_fee.usd_est", "vex_fee_usd_est"),
  vexFeeColumn("vex_fee.decimals", "vex_fee_decimals"),
  vexFeeColumn("vex_fee.symbol", "vex_fee_symbol"),
  vexFeeColumn("vex_fee.tx_hash", "vex_fee_tx_hash"),
  vexFeeColumn("vex_fee.status", "vex_fee_status"),
  vexFeeColumn("vex_fee.chain_family", "vex_fee_chain_family"),
  vexFeeColumn("vex_fee.chain_id::text", "vex_fee_chain_id"),
].join(",\n  ");

/** A fee leg is execution plumbing, never a row of its own on any public list or count. */
const LOGICAL_ROW_PREDICATE = logicalRowIn("a.event_role");

/**
 * The id of the logical row a leg belongs to: itself for an action, and the action it charges for
 * when it is a fee leg. The parent is the lowest-indexed NON-fee leg of the same execution, so a
 * bridge fee resolves to the deposit rather than to the other fee of a multi-fee anomaly.
 *
 * `source_execution_id` is unique only within an agent, so the join carries `agent_hash` too.
 * A fee leg with no parent yields NULL, and the caller finds nothing - fail closed, never a guess.
 */
const LOGICAL_ROW_ID = `
       CASE WHEN ${vexFeeLegRolesIn("leg.event_role")}
            THEN (SELECT parent.id
                    FROM activities parent
                   WHERE parent.agent_hash = leg.agent_hash
                     AND parent.source_execution_id = leg.source_execution_id
                     AND ${logicalRowIn("parent.event_role")}
                   ORDER BY parent.event_index, parent.id
                   LIMIT 1)
            ELSE leg.id
       END`;

const ACTIVITY_COLUMNS = `
  ${ACTIVITY_EVENT_TIME} AS event_time,
  a.id, a.agent_hash, a.source_row_id, a.public_id, a.source_execution_id, a.event_index,
  a.kind, a.event_role, a.status, a.protocol, a.chain_family, a.chain_id, a.from_chain_id, a.to_chain_id,
  a.token_in_address, a.token_in_symbol, a.token_in_decimals,
  a.token_out_address, a.token_out_symbol, a.token_out_decimals,
  a.amount_in_raw, a.amount_out_raw, a.executed_in_raw, a.executed_out_raw,
  a.token_out2_symbol, a.token_out2_decimals, a.amount_out2_raw, a.executed_out2_raw,
  a.usd_in_est, a.usd_out_est, a.usd_fee_est, a.usd_source,
  a.tx_hash, a.failure_code,
  a.client_created_at, a.client_confirmed_at, a.client_observed_at,
  a.statuses_seen, a.verification_state, a.verified_at, a.backfill, a.received_at, a.received_schema_version,
  ${VEX_FEE_COLUMNS}`;

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
    token_out2_symbol: raw.token_out2_symbol,
    token_out2_decimals: raw.token_out2_decimals,
    amount_out2_raw: raw.amount_out2_raw,
    executed_out2_raw: raw.executed_out2_raw,
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
    event_time: raw.event_time,
    vex_fee_amount_raw: raw.vex_fee_amount_raw,
    vex_fee_decimals: raw.vex_fee_decimals,
    vex_fee_symbol: raw.vex_fee_symbol,
    vex_fee_tx_hash: raw.vex_fee_tx_hash,
    vex_fee_status: raw.vex_fee_status,
    vex_fee_usd_est: raw.vex_fee_usd_est,
    vex_fee_chain_family: raw.vex_fee_chain_family,
    vex_fee_chain_id: raw.vex_fee_chain_id === null ? null : BigInt(raw.vex_fee_chain_id),
  };
}

function singleRow<T extends pg.QueryResultRow>(result: pg.QueryResult<T>): T {
  const row = result.rows[0];
  if (row === undefined) throw new Error("aggregate query returned no rows");
  return row;
}

export type ActivityKindFilter = EventKind;
export type ActivityStatusFilter = EventStatus;
export type ActivityVerificationFilter = "verified_full" | "verified_basic" | "pending";

export type ActivityFilters = {
  kind: ActivityKindFilter | null;
  protocol: string | null;
  chain: string | null;
  status: ActivityStatusFilter | null;
  verification: ActivityVerificationFilter | null;
};

export type RawActivityFilters = { [Dimension in keyof ActivityFilters]?: unknown };

const ACTIVITY_KIND_FILTERS: readonly ActivityKindFilter[] = EVENT_KINDS;
const ACTIVITY_STATUS_FILTERS: readonly ActivityStatusFilter[] = EVENT_STATUSES;
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
    query.cursor?.eventTime ?? null,
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
${VEX_FEE_LEG_LATERAL}
     WHERE ${VISIBILITY_PREDICATE}
       AND ${LOGICAL_ROW_PREDICATE}
       AND ($1::timestamptz IS NULL OR (${ACTIVITY_EVENT_TIME}, a.id) < ($1::timestamptz, $2::bigint))
       ${filterSql}
     ORDER BY ${ACTIVITY_EVENT_TIME} DESC, a.id DESC
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
    `WITH requested AS (
       SELECT ${LOGICAL_ROW_ID} AS id
       FROM activities leg
       WHERE leg.public_id = $1
     )
     SELECT ${ACTIVITY_COLUMNS}
     FROM activities a
     JOIN agents ag ON ag.agent_hash = a.agent_hash
${VEX_FEE_LEG_LATERAL}
     WHERE a.id = (SELECT id FROM requested) AND ${VISIBILITY_PREDICATE}
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
    `WITH matched AS (
       SELECT ${LOGICAL_ROW_ID} AS id
       FROM activities leg
       WHERE leg.public_id = $1 OR lower(leg.tx_hash) = ANY($2::text[])
       ORDER BY leg.id
       LIMIT 1
     )
     SELECT a.public_id
     FROM activities a
     JOIN agents ag ON ag.agent_hash = a.agent_hash
     WHERE a.id = (SELECT id FROM matched) AND ${VISIBILITY_PREDICATE}
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

/**
 * `tx_count` here is `daily_aggregates.tx_count`, which `activities-verify-repo` writes once per
 * verified activity and never recomputes. The fee-leg fold for these totals therefore lives at that
 * writer (`txCountContribution`), not in this query: there is no fee-role column to filter on.
 */
export async function aggregateTotals(pool: pg.Pool): Promise<AggregateTotals> {
  const result = await pool.query<{
    daily_volume_usd: string;
    total_volume_usd: string;
    daily_tx: number;
    total_tx: number;
  }>(
    `SELECT
       COALESCE(SUM(volume_usd_priced) FILTER (WHERE day = ${CURRENT_UTC_DAY}), 0)::text AS daily_volume_usd,
       COALESCE(SUM(volume_usd_priced), 0)::text AS total_volume_usd,
       COALESCE(SUM(tx_count) FILTER (WHERE day = ${CURRENT_UTC_DAY}), 0)::int AS daily_tx,
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
    `SELECT COUNT(DISTINCT a.agent_hash)::int AS active_agents
     FROM activities a
     WHERE ${VERIFIED_STATES_PREDICATE}
       AND ${ACTIVITY_TIME_ANCHOR} > now() - interval '7 days'`,
  );
  return singleRow(result).active_agents;
}

export async function countRegisteredAgents(pool: pg.Pool): Promise<number> {
  const result = await pool.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM agents");
  return singleRow(result).n;
}

export type ChartBucketRead = { bucketStart: number; volumeUsd: string; txCount: number };

type ChartBucketQueryRow = { bucket_start: string; volume_usd: string; tx_count: number };

const ACTIVITY_TIME_ANCHOR = activityTimeAnchorSql("a");
const VERIFIED_STATES_PREDICATE = "a.verification_state IN ('verified_full','verified_basic')";
const VOLUME_LEG_PREDICATE = capitalDeployingRolesIn("a.event_role");
const VOLUME_LEG_USD_SUM = serverPricedUsdInSumOf("a", VOLUME_LEG_PREDICATE);
const CURRENT_UTC_DAY = "(now() AT TIME ZONE 'utc')::date";

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
       SELECT (floor(extract(epoch FROM ${ACTIVITY_TIME_ANCHOR}) / $1::bigint)
                 * $1::bigint)::bigint AS bucket_start,
              ${serverPricedUsdInSumOf("a", VOLUME_LEG_PREDICATE)} AS volume_usd,
              COUNT(*)::int AS tx_count
       FROM activities a
       WHERE a.verification_state IN ('verified_full','verified_basic')
         AND ${LOGICAL_ROW_PREDICATE}
         AND ${ACTIVITY_TIME_ANCHOR} >= to_timestamp((SELECT first_start FROM span))
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
       SELECT day, SUM(volume_usd_priced) AS volume_usd, SUM(tx_count)::int AS tx_count
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

export type AgentLeaderboardCursor = { volumeUsd: string; agentHash: string };

type AgentVolumeQueryRow = {
  agent_hash: string;
  volume_usd: string;
  tx_count: number;
  protocol_count: number;
  chain_count: number;
  last_seen_seconds: number;
};

function agentVolumeFrom(row: AgentVolumeQueryRow): AgentVolumeRead {
  return {
    agentHash: row.agent_hash,
    volumeUsd: row.volume_usd,
    txCount: row.tx_count,
    protocolCount: row.protocol_count,
    chainCount: row.chain_count,
    lastSeenSeconds: row.last_seen_seconds,
  };
}

const AGENT_VOLUME_INNER = `SELECT a.agent_hash,
            ${USD_IN_SUM}::text AS volume_usd,
            COUNT(*)::int AS tx_count,
            COUNT(DISTINCT a.protocol)::int AS protocol_count,
            ${DISTINCT_CHAIN_COUNT} AS chain_count,
            GREATEST(0, floor(extract(epoch FROM
              now() - COALESCE(MAX(${ACTIVITY_TIME_ANCHOR}), MAX(a.received_at)))))::int AS last_seen_seconds
     FROM activities a
     WHERE ${VERIFIED_STATES_PREDICATE}
       AND ${VOLUME_LEG_PREDICATE}
       AND ${windowPredicate(1)}
     GROUP BY a.agent_hash`;

export async function countLeaderboardAgents(
  pool: pg.Pool,
  windowSeconds: number | null,
): Promise<number> {
  const result = await pool.query<{ n: number }>(
    `SELECT COUNT(DISTINCT a.agent_hash)::int AS n
     FROM activities a
     WHERE ${VERIFIED_STATES_PREDICATE}
       AND ${VOLUME_LEG_PREDICATE}
       AND ${windowPredicate(1)}`,
    [windowSeconds],
  );
  return singleRow(result).n;
}

export async function agentLeaderboard(
  pool: pg.Pool,
  windowSeconds: number | null,
  page?: { limit: number; after?: AgentLeaderboardCursor | null },
): Promise<AgentVolumeRead[]> {
  const after = page?.after ?? null;
  const result = await pool.query<AgentVolumeQueryRow>(
    `SELECT ranked.agent_hash,
            ranked.volume_usd,
            ranked.tx_count,
            ranked.protocol_count,
            ranked.chain_count,
            ranked.last_seen_seconds
     FROM (${AGENT_VOLUME_INNER}) ranked
     WHERE ($2::text IS NULL
        OR ranked.volume_usd::numeric < $2::numeric
        OR (ranked.volume_usd::numeric = $2::numeric AND ranked.agent_hash > $3))
     ORDER BY ranked.volume_usd::numeric DESC, ranked.agent_hash
     ${page === undefined ? "" : "LIMIT $4"}`,
    page === undefined
      ? [windowSeconds, null, null]
      : [windowSeconds, after?.volumeUsd ?? null, after?.agentHash ?? null, page.limit],
  );
  return result.rows.map(agentVolumeFrom);
}

export type ProtocolRead = { protocol: string; volumeUsd: string; txCount: number };

export type ProtocolRankingRead = ProtocolRead & {
  chainCount: number;
  swapTxCount: number;
  bridgeTxCount: number;
};

export async function protocolTotals(pool: pg.Pool): Promise<ProtocolRead[]> {
  const result = await pool.query<{ protocol: string; volume_usd: string; tx_count: number }>(
    `SELECT protocol,
            SUM(volume_usd_priced)::text AS volume_usd,
            SUM(tx_count)::int AS tx_count
     FROM daily_aggregates
     GROUP BY protocol
     ORDER BY SUM(volume_usd_priced) DESC, protocol`,
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
       AND ${LOGICAL_ROW_PREDICATE}
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

function activityCountWhere(predicate: string): string {
  return `COUNT(*) FILTER (WHERE ${predicate})::int`;
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
    `SELECT ${activityCountWhere(contributesUsd("a"))} AS priced_activity_count,
            ${activityCountWhere(contributesNoUsd("a"))} AS unpriced_activity_count,
            ${activityCountWhere(awaitingAPrice("a"))} AS pending_activity_count
     FROM activities a
     WHERE ${VERIFIED_STATES_PREDICATE}
       AND ${VOLUME_LEG_PREDICATE}
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
