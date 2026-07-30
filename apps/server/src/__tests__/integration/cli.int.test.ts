import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAgentsAwaitingPurge } from "../../cli/purge-status.js";
import { liftQuarantine, listQuarantinedAgents } from "../../cli/quarantine.js";
import { retryVerification } from "../../cli/verify-retry.js";
import { loadConfig } from "../../config.js";
import { finalizeVerification } from "../../repos/activities-verify-repo.js";
import { startTestDb } from "../../testing/pg-harness.js";

const config = loadConfig({ DATABASE_URL: "postgres://unused-in-tests" });

const quarantinedAgent = "d".repeat(64);
const activeAgent = "e".repeat(64);
const awaitingPurgeAgent = "f".repeat(64);
const purgedAgent = "1".repeat(64);

let db: Awaited<ReturnType<typeof startTestDb>>;
let seedCounter = 0;

beforeAll(async () => {
  db = await startTestDb();
});

afterAll(async () => {
  await db.stop();
});

function onlyRow<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error("expected exactly one row");
  return row;
}

async function seedAgent(
  agentHash: string,
  overrides: { status?: string; strikeCount?: number; quarantinedAt?: string | null; revokedHoursAgo?: number | null; purgedAt?: string | null } = {},
): Promise<void> {
  await db.pool.query(
    `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, status, strike_count, quarantined_at, revoked_at, purged_at)
     VALUES ($1, 'sha', 1, now(), $2, $3, $4::timestamptz, now() - make_interval(hours => $5), $6::timestamptz)`,
    [
      agentHash,
      overrides.status ?? "active",
      overrides.strikeCount ?? 0,
      overrides.quarantinedAt ?? null,
      overrides.revokedHoursAgo ?? null,
      overrides.purgedAt ?? null,
    ],
  );
}

async function seedActivity(agentHash: string, verificationState: string): Promise<{ activityId: bigint; publicId: string }> {
  seedCounter += 1;
  const rowKey = `cli-seed-${seedCounter}`;
  const inserted = await db.pool.query<{ id: string }>(
    `INSERT INTO activities
       (agent_hash, source_row_id, public_id, source_execution_id, event_index, kind, event_role, status,
        protocol, chain_family, chain_id, usd_in_est, tx_hash,
        client_created_at, client_confirmed_at, statuses_seen, verification_state, received_schema_version)
     VALUES ($1, $2, $2, $2, 0, 'swap', 'swap', 'confirmed', 'p-cli', 'eip155', 8453, '7.5', $3,
             now() - interval '1 hour', '2026-07-29T10:00:00Z', ARRAY['pending','confirmed'], $4, 1)
     RETURNING id`,
    [agentHash, rowKey, `0xtx-${rowKey}`, verificationState],
  );
  return { activityId: BigInt(onlyRow(inserted.rows).id), publicId: rowKey };
}

async function agentRowOf(agentHash: string): Promise<{ status: string; strike_count: number }> {
  const result = await db.pool.query<{ status: string; strike_count: number }>(
    "SELECT status, strike_count FROM agents WHERE agent_hash = $1",
    [agentHash],
  );
  return onlyRow(result.rows);
}

async function verificationStateOf(activityId: bigint): Promise<string> {
  const result = await db.pool.query<{ verification_state: string }>(
    "SELECT verification_state FROM activities WHERE id = $1",
    [activityId.toString()],
  );
  return onlyRow(result.rows).verification_state;
}

describe("operator cli actions", () => {
  it("lists quarantined agents", async () => {
    await seedAgent(quarantinedAgent, { status: "quarantined", strikeCount: 3, quarantinedAt: "2026-07-29T08:00:00Z" });
    await seedAgent(activeAgent);

    const listed = await listQuarantinedAgents(db.pool);

    expect(listed).toEqual([
      { agentHash: quarantinedAgent, strikeCount: 3, quarantinedAt: new Date("2026-07-29T08:00:00Z") },
    ]);
  });

  it("lifts quarantine back to active with zero strikes and writes an operator_lift audit row", async () => {
    const outcome = await liftQuarantine(db.pool, quarantinedAgent);

    expect(outcome).toEqual({ lifted: true });
    expect(await agentRowOf(quarantinedAgent)).toEqual({ status: "active", strike_count: 0 });
    const audit = await db.pool.query<{ reason: string }>(
      "SELECT reason FROM strikes WHERE agent_hash = $1 ORDER BY id",
      [quarantinedAgent],
    );
    expect(audit.rows).toEqual([{ reason: "operator_lift" }]);
  });

  it("refuses to lift an agent that is not quarantined", async () => {
    const outcome = await liftQuarantine(db.pool, activeAgent);

    expect(outcome).toEqual({ lifted: false });
    expect(await agentRowOf(activeAgent)).toEqual({ status: "active", strike_count: 0 });
  });

  it("verify retry requeues the activity and inserts a due job with zero attempts in one transaction outcome", async () => {
    const { activityId, publicId } = await seedActivity(activeAgent, "mismatch");

    const outcome = await retryVerification(db.pool, publicId);

    expect(outcome).toEqual({ requeued: true });
    expect(await verificationStateOf(activityId)).toBe("queued");
    const job = await db.pool.query<{ attempts: number; due: boolean }>(
      "SELECT attempts, (next_attempt_at <= now()) AS due FROM verification_jobs WHERE activity_id = $1",
      [activityId.toString()],
    );
    expect(job.rows).toEqual([{ attempts: 0, due: true }]);
  });

  it("verify retry unlocks the finalization CAS so a subsequent finalizeVerification succeeds", async () => {
    const { activityId, publicId } = await seedActivity(activeAgent, "none");
    await retryVerification(db.pool, publicId);

    await finalizeVerification(
      db.pool,
      activityId,
      { result: "verified_full", blockTimestamp: new Date("2026-07-29T10:00:00Z") },
      config,
    );

    expect(await verificationStateOf(activityId)).toBe("verified_full");
    const job = await db.pool.query("SELECT 1 FROM verification_jobs WHERE activity_id = $1", [
      activityId.toString(),
    ]);
    expect(job.rows).toEqual([]);
  });

  it("verify retry reports an unknown public id without touching anything", async () => {
    const outcome = await retryVerification(db.pool, "no-such-public-id");

    expect(outcome).toEqual({ requeued: false });
  });

  it("purge status lists revoked agents without purged_at including their age", async () => {
    await seedAgent(awaitingPurgeAgent, { status: "revoked", revokedHoursAgo: 3 });
    await seedAgent(purgedAgent, { status: "revoked", revokedHoursAgo: 30, purgedAt: "2026-07-29T09:00:00Z" });

    const listed = await listAgentsAwaitingPurge(db.pool);

    expect(listed).toHaveLength(1);
    expect(listed[0]?.agentHash).toBe(awaitingPurgeAgent);
    expect(listed[0]?.ageSeconds).toBeGreaterThan(3 * 3600 - 60);
    expect(listed[0]?.ageSeconds).toBeLessThan(3 * 3600 + 60);
  });
});
