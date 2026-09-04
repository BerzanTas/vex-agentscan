import type pg from "pg";
import {
  deploysCapitalRole,
  isLaunchShaped,
  isVexFeeLegRole,
  type Verdict,
  type VerificationKind,
} from "@agentscan/core";
import type { Config } from "../config.js";
import { activityAggregateDaySql } from "./activity-time-anchor.js";

export type SqlExecutor = Pick<pg.PoolClient, "query">;

export type TerminalVerdict = Extract<Verdict, { result: "verified_full" | "verified_basic" | "strike" }>;

export type ClaimedJob = {
  activityId: bigint;
  publicId: string;
  attempts: number;
  firstAttemptAt: Date;
  txHash: string | null;
  protocol: string;
  chainFamily: "eip155" | "solana";
  chainId: bigint;
  kind: VerificationKind;
  clientConfirmedAt: Date | null;
  executedInRaw: string | null;
  executedOutRaw: string | null;
  tokenInAddress: string | null;
  tokenOutAddress: string | null;
};

type ClaimedJobRow = {
  activity_id: string;
  public_id: string;
  attempts: number;
  first_attempt_at: Date;
  tx_hash: string | null;
  protocol: string;
  chain_family: "eip155" | "solana";
  chain_id: string;
  kind: VerificationKind;
  client_confirmed_at: Date | null;
  executed_in_raw: string | null;
  executed_out_raw: string | null;
  token_in_address: string | null;
  token_out_address: string | null;
};

const ACTIVITY_CLAIMS_AN_INCLUSION = "a.status <> 'superseded_unproven'";

export async function claimDueJobs(
  pool: pg.Pool,
  limit: number,
  leaseSec: number,
): Promise<ClaimedJob[]> {
  const result = await pool.query<ClaimedJobRow>(
    `UPDATE verification_jobs vj
     SET next_attempt_at = now() + make_interval(secs => $2::float8)
     FROM activities a
     WHERE a.id = vj.activity_id
       AND ${ACTIVITY_CLAIMS_AN_INCLUSION}
       AND vj.activity_id IN (
         SELECT activity_id FROM verification_jobs
         WHERE next_attempt_at <= now()
         ORDER BY next_attempt_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
     RETURNING vj.activity_id, vj.attempts, vj.first_attempt_at, a.public_id,
               a.tx_hash, a.protocol, a.chain_family, a.chain_id, a.kind,
               a.client_confirmed_at, a.executed_in_raw, a.executed_out_raw,
               a.token_in_address, a.token_out_address`,
    [limit, leaseSec],
  );
  return result.rows.map((row) => ({
    activityId: BigInt(row.activity_id),
    publicId: row.public_id,
    attempts: row.attempts,
    firstAttemptAt: row.first_attempt_at,
    txHash: row.tx_hash,
    protocol: row.protocol,
    chainFamily: row.chain_family,
    chainId: BigInt(row.chain_id),
    kind: row.kind,
    clientConfirmedAt: row.client_confirmed_at,
    executedInRaw: row.executed_in_raw,
    executedOutRaw: row.executed_out_raw,
    tokenInAddress: row.token_in_address,
    tokenOutAddress: row.token_out_address,
  }));
}

export type QueueDepth = {
  dueJobs: number;
  totalPending: number;
  oldestDueAgeSec: number | null;
};

type QueueDepthRow = {
  due_jobs: number;
  total_pending: number;
  oldest_due_age_sec: number | null;
};

export async function queueDepth(pool: pg.Pool): Promise<QueueDepth> {
  const result = await pool.query<QueueDepthRow>(
    `SELECT
       count(*) FILTER (WHERE next_attempt_at <= now())::int AS due_jobs,
       count(*)::int AS total_pending,
       EXTRACT(EPOCH FROM (now() - min(next_attempt_at) FILTER (WHERE next_attempt_at <= now())))::float8
         AS oldest_due_age_sec
     FROM verification_jobs`,
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("queue depth query returned no rows");
  return {
    dueJobs: row.due_jobs,
    totalPending: row.total_pending,
    oldestDueAgeSec: row.oldest_due_age_sec,
  };
}

type FinalizedActivityRow = {
  agent_hash: string;
  protocol: string;
  kind: VerificationKind;
  event_role: string;
  usd_in_est: string | null;
  aggregate_day: string;
};

function blockTimeOf(verdict: TerminalVerdict): Date | null {
  return verdict.result === "strike" ? null : verdict.blockTimestamp;
}

export async function finalizeVerification(
  client: SqlExecutor,
  activityId: bigint,
  verdict: TerminalVerdict,
  config: Config,
): Promise<void> {
  const state = verdict.result === "strike" ? "mismatch" : verdict.result;
  const finalized = await client.query<FinalizedActivityRow>(
    `UPDATE activities SET verification_state = $2, verified_at = now(), block_time = $3::timestamptz
     WHERE id = $1 AND verification_state = 'queued'
     RETURNING agent_hash, protocol, kind, event_role, usd_in_est,
               ${activityAggregateDaySql("activities")}::text AS aggregate_day`,
    [activityId.toString(), state, blockTimeOf(verdict)],
  );
  const activity = finalized.rows[0];
  if (activity === undefined) return;
  if (verdict.result === "strike" && !isLaunchShaped(activity.kind, activity.event_role)) {
    await recordStrike(client, activityId, activity.agent_hash, verdict.reason, config);
  } else if (verdict.result !== "strike") {
    await recordVerifiedSuccess(client, activity);
  }
  await deleteJob(client, activityId);
}

export async function rescheduleJob(
  client: SqlExecutor,
  activityId: bigint,
  delayMs: number,
  lastError: string,
): Promise<void> {
  await client.query(
    `UPDATE verification_jobs
     SET attempts = attempts + 1,
         next_attempt_at = now() + make_interval(secs => $2::float8),
         last_error = $3
     WHERE activity_id = $1`,
    [activityId.toString(), delayMs / 1000, lastError],
  );
}

export async function closeUnverifiable(client: SqlExecutor, activityId: bigint): Promise<void> {
  await client.query(
    "UPDATE activities SET verification_state = 'none' WHERE id = $1 AND verification_state = 'queued'",
    [activityId.toString()],
  );
  await deleteJob(client, activityId);
}

async function recordVerifiedSuccess(client: SqlExecutor, activity: FinalizedActivityRow): Promise<void> {
  await client.query(
    "UPDATE agents SET first_verified_at = COALESCE(first_verified_at, now()), updated_at = now() WHERE agent_hash = $1",
    [activity.agent_hash],
  );
  await client.query(
    `INSERT INTO daily_aggregates (day, protocol, kind, volume_usd, tx_count)
     VALUES ($1::date, $2, $3, $4::numeric, $5::int)
     ON CONFLICT (day, protocol, kind)
     DO UPDATE SET volume_usd = daily_aggregates.volume_usd + EXCLUDED.volume_usd,
                   tx_count = daily_aggregates.tx_count + EXCLUDED.tx_count`,
    [
      activity.aggregate_day,
      activity.protocol,
      activity.kind,
      volumeContribution(activity),
      txCountContribution(activity),
    ],
  );
}

function volumeContribution(activity: Pick<FinalizedActivityRow, "event_role" | "usd_in_est">): string {
  if (!deploysCapitalRole(activity.event_role)) return "0";
  return activity.usd_in_est ?? "0";
}

/**
 * The Vex fee is a separate transaction but part of the ACTION it charges for, so it adds nothing
 * to the transaction count - the same fold the read model applies to the feed and the tx page.
 *
 * This counter is the ONLY owner of `total_tx`, `daily_tx` and the per-protocol count: those read
 * `daily_aggregates`, which is written incrementally here and never recomputed from `activities`.
 * A fee leg counted before this change therefore stays counted; only new verifications fold.
 */
function txCountContribution(activity: Pick<FinalizedActivityRow, "event_role">): number {
  return isVexFeeLegRole(activity.event_role) ? 0 : 1;
}

async function recordStrike(
  client: SqlExecutor,
  activityId: bigint,
  agentHash: string,
  reason: string,
  config: Config,
): Promise<void> {
  await client.query("INSERT INTO strikes (agent_hash, activity_id, reason) VALUES ($1, $2, $3)", [
    agentHash,
    activityId.toString(),
    reason,
  ]);
  const struck = await client.query<{ strike_count: number }>(
    "UPDATE agents SET strike_count = strike_count + 1, updated_at = now() WHERE agent_hash = $1 RETURNING strike_count",
    [agentHash],
  );
  if (struck.rowCount === 0) return;
  const independent = await independentStrikeShapes(client, agentHash);
  if (independent < config.QUARANTINE_STRIKES) return;
  await client.query(
    `UPDATE agents
     SET status = 'quarantined', quarantined_at = COALESCE(quarantined_at, now()), updated_at = now()
     WHERE agent_hash = $1`,
    [agentHash],
  );
}

async function independentStrikeShapes(client: SqlExecutor, agentHash: string): Promise<number> {
  const shapes = await client.query<{ shapes: number }>(
    `SELECT count(*)::int AS shapes FROM (
       SELECT DISTINCT s.reason, a.protocol, a.kind, a.event_role, a.chain_family, a.chain_id
         FROM strikes s JOIN activities a ON a.id = s.activity_id
        WHERE s.agent_hash = $1
     ) distinct_shapes`,
    [agentHash],
  );
  return shapes.rows[0]?.shapes ?? 0;
}

async function deleteJob(client: SqlExecutor, activityId: bigint): Promise<void> {
  await client.query("DELETE FROM verification_jobs WHERE activity_id = $1", [activityId.toString()]);
}
