import type pg from "pg";
import { isStrikeEligibleKind, type Verdict, type VerificationKind } from "@agentscan/core";
import type { Config } from "../config.js";

export type SqlExecutor = Pick<pg.PoolClient, "query">;

export type TerminalVerdict = Extract<Verdict, { result: "verified_full" | "verified_basic" | "strike" }>;

export type ClaimedJob = {
  activityId: bigint;
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
       AND vj.activity_id IN (
         SELECT activity_id FROM verification_jobs
         WHERE next_attempt_at <= now()
         ORDER BY next_attempt_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
     RETURNING vj.activity_id, vj.attempts, vj.first_attempt_at,
               a.tx_hash, a.protocol, a.chain_family, a.chain_id, a.kind,
               a.client_confirmed_at, a.executed_in_raw, a.executed_out_raw,
               a.token_in_address, a.token_out_address`,
    [limit, leaseSec],
  );
  return result.rows.map((row) => ({
    activityId: BigInt(row.activity_id),
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

type FinalizedActivityRow = {
  agent_hash: string;
  protocol: string;
  kind: VerificationKind;
  event_role: string;
  usd_in_est: string | null;
  client_confirmed_at: Date | null;
};

export async function finalizeVerification(
  client: SqlExecutor,
  activityId: bigint,
  verdict: TerminalVerdict,
  config: Config,
): Promise<void> {
  const state = verdict.result === "strike" ? "mismatch" : verdict.result;
  const finalized = await client.query<FinalizedActivityRow>(
    `UPDATE activities SET verification_state = $2, verified_at = now()
     WHERE id = $1 AND verification_state = 'queued'
     RETURNING agent_hash, protocol, kind, event_role, usd_in_est, client_confirmed_at`,
    [activityId.toString(), state],
  );
  const activity = finalized.rows[0];
  if (activity === undefined) return;
  if (verdict.result === "strike" && isStrikeEligibleKind(activity.kind)) {
    await recordStrike(client, activityId, activity.agent_hash, verdict.reason, config);
  } else if (verdict.result !== "strike") {
    await recordVerifiedSuccess(client, activity, verdict.blockTimestamp);
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

async function recordVerifiedSuccess(
  client: SqlExecutor,
  activity: FinalizedActivityRow,
  blockTimestamp: Date,
): Promise<void> {
  await client.query(
    "UPDATE agents SET first_verified_at = COALESCE(first_verified_at, now()), updated_at = now() WHERE agent_hash = $1",
    [activity.agent_hash],
  );
  await client.query(
    `INSERT INTO daily_aggregates (day, protocol, kind, volume_usd, tx_count)
     VALUES (($1::timestamptz AT TIME ZONE 'utc')::date, $2, $3, $4::numeric, 1)
     ON CONFLICT (day, protocol, kind)
     DO UPDATE SET volume_usd = daily_aggregates.volume_usd + EXCLUDED.volume_usd,
                   tx_count = daily_aggregates.tx_count + 1`,
    [activity.client_confirmed_at ?? blockTimestamp, activity.protocol, activity.kind, volumeContribution(activity)],
  );
}

function volumeContribution(activity: Pick<FinalizedActivityRow, "event_role" | "usd_in_est">): string {
  if (activity.event_role !== "swap" && activity.event_role !== "bridge_deposit") return "0";
  return activity.usd_in_est ?? "0";
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
  const strikeCount = struck.rows[0]?.strike_count ?? 0;
  if (strikeCount < config.QUARANTINE_STRIKES) return;
  await client.query(
    `UPDATE agents
     SET status = 'quarantined', quarantined_at = COALESCE(quarantined_at, now()), updated_at = now()
     WHERE agent_hash = $1`,
    [agentHash],
  );
}

async function deleteJob(client: SqlExecutor, activityId: bigint): Promise<void> {
  await client.query("DELETE FROM verification_jobs WHERE activity_id = $1", [activityId.toString()]);
}
