import type { EventStatus, IngestEvent } from "@agentscan/contract";
import { decideIngest, generatePublicId } from "@agentscan/core";
import type pg from "pg";

export type ApplyEventOutcome = "accepted" | "duplicate";

type ExistingActivityRow = {
  id: string;
  status: EventStatus;
  statuses_seen: EventStatus[];
};

type VerificationStateRow = { id: string; verification_state: string };

const SELECT_EXISTING_FOR_UPDATE = `
  SELECT id, status, statuses_seen
  FROM activities
  WHERE agent_hash = $1 AND source_row_id = $2
  FOR UPDATE`;

const INSERT_ACTIVITY = `
  INSERT INTO activities (
    agent_hash, source_row_id, public_id, source_execution_id, event_index,
    kind, event_role, status, protocol, chain_family, chain_id, from_chain_id, to_chain_id,
    token_in_address, token_in_symbol, token_in_decimals,
    token_out_address, token_out_symbol, token_out_decimals,
    amount_in_raw, amount_out_raw, executed_in_raw, executed_out_raw,
    usd_in_est, usd_out_est, usd_fee_est, usd_source,
    tx_hash, failure_code, client_created_at, client_confirmed_at, client_observed_at,
    statuses_seen, verification_state, backfill, received_schema_version
  ) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
    $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36
  )
  RETURNING id, verification_state`;

const PROMOTE_PENDING_ACTIVITY = `
  UPDATE activities SET
    status = $2,
    statuses_seen = statuses_seen || $3::text[],
    tx_hash = COALESCE($4, tx_hash),
    executed_in_raw = COALESCE($5, executed_in_raw),
    executed_out_raw = COALESCE($6, executed_out_raw),
    usd_in_est = COALESCE($7::numeric, usd_in_est),
    usd_out_est = COALESCE($8::numeric, usd_out_est),
    usd_fee_est = COALESCE($9::numeric, usd_fee_est),
    usd_source = COALESCE($10, usd_source),
    failure_code = COALESCE($11, failure_code),
    client_confirmed_at = COALESCE($12::timestamptz, client_confirmed_at),
    client_observed_at = COALESCE($13::timestamptz, client_observed_at),
    verification_state = CASE
      WHEN $2 = 'confirmed' AND COALESCE($4, tx_hash) IS NOT NULL THEN 'queued'
      ELSE verification_state
    END
  WHERE id = $1 AND status = 'pending'
  RETURNING id, verification_state`;

const APPEND_STATUS_SEEN = `
  UPDATE activities SET statuses_seen = statuses_seen || $2::text[] WHERE id = $1`;

const ENQUEUE_VERIFICATION_JOB = `
  INSERT INTO verification_jobs (activity_id, next_attempt_at)
  VALUES ($1, now())
  ON CONFLICT DO NOTHING`;

function lockedRow(row: ExistingActivityRow | undefined): ExistingActivityRow {
  if (row === undefined) throw new Error("activity row vanished under lock");
  return row;
}

function initialVerificationState(event: IngestEvent): string {
  return event.status === "confirmed" && event.txHash !== null ? "queued" : "none";
}

async function enqueueWhenQueued(client: pg.PoolClient, row: VerificationStateRow): Promise<void> {
  if (row.verification_state !== "queued") return;
  await client.query(ENQUEUE_VERIFICATION_JOB, [row.id]);
}

async function insertActivity(
  client: pg.PoolClient,
  agentHash: string,
  event: IngestEvent,
  schemaVersion: number,
  backfill: boolean,
): Promise<ApplyEventOutcome> {
  const inserted = await client.query<VerificationStateRow>(INSERT_ACTIVITY, [
    agentHash,
    event.sourceRowId,
    generatePublicId(),
    event.sourceExecutionId,
    event.eventIndex,
    event.kind,
    event.eventRole,
    event.status,
    event.protocol,
    event.chainFamily,
    event.chainId.toString(),
    event.fromChainId === null ? null : event.fromChainId.toString(),
    event.toChainId === null ? null : event.toChainId.toString(),
    event.tokenIn?.address ?? null,
    event.tokenIn?.symbol ?? null,
    event.tokenIn?.decimals ?? null,
    event.tokenOut?.address ?? null,
    event.tokenOut?.symbol ?? null,
    event.tokenOut?.decimals ?? null,
    event.amountInRaw,
    event.amountOutRaw,
    event.executedInRaw,
    event.executedOutRaw,
    event.usdInEst,
    event.usdOutEst,
    event.usdFeeEst,
    event.usdSource,
    event.txHash,
    event.failureCode,
    event.createdAt,
    event.confirmedAt,
    event.observedAt,
    [event.status],
    initialVerificationState(event),
    backfill,
    schemaVersion,
  ]);
  const insertedRow = inserted.rows[0];
  if (insertedRow === undefined) throw new Error("activity insert returned no row");
  await enqueueWhenQueued(client, insertedRow);
  return "accepted";
}

async function promotePendingActivity(
  client: pg.PoolClient,
  activityId: string,
  event: IngestEvent,
): Promise<ApplyEventOutcome> {
  const promoted = await client.query<VerificationStateRow>(PROMOTE_PENDING_ACTIVITY, [
    activityId,
    event.status,
    [event.status],
    event.txHash,
    event.executedInRaw,
    event.executedOutRaw,
    event.usdInEst,
    event.usdOutEst,
    event.usdFeeEst,
    event.usdSource,
    event.failureCode,
    event.confirmedAt,
    event.observedAt,
  ]);
  const promotedRow = promoted.rows[0];
  if (promotedRow === undefined) return "duplicate";
  await enqueueWhenQueued(client, promotedRow);
  return "accepted";
}

export async function applyEvent(
  client: pg.PoolClient,
  agentHash: string,
  event: IngestEvent,
  schemaVersion: number,
  backfill: boolean,
): Promise<ApplyEventOutcome> {
  const existing = await client.query<ExistingActivityRow>(SELECT_EXISTING_FOR_UPDATE, [
    agentHash,
    event.sourceRowId,
  ]);
  const row = existing.rows[0];
  const decision = decideIngest(
    row === undefined ? null : { status: row.status, statusesSeen: row.statuses_seen },
    event.status,
  );
  switch (decision.outcome) {
    case "insert":
      return insertActivity(client, agentHash, event, schemaVersion, backfill);
    case "duplicate":
      return "duplicate";
    case "promote":
      return promotePendingActivity(client, lockedRow(row).id, event);
    case "accept_noop":
      await client.query(APPEND_STATUS_SEEN, [lockedRow(row).id, [event.status]]);
      return "accepted";
  }
}
