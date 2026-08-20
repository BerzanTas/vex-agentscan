import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { revokeTokenAttestations } from "../../cli/attestation-revoke.js";
import { listAgentsAwaitingPurge } from "../../cli/purge-status.js";
import { liftQuarantine, listQuarantinedAgents } from "../../cli/quarantine.js";
import { reopenVerification } from "../../cli/verify-reopen.js";
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

async function seedActivity(
  agentHash: string,
  verificationState: string,
  protocol = "p-cli",
  status = "confirmed",
): Promise<{ activityId: bigint; publicId: string }> {
  seedCounter += 1;
  const rowKey = `cli-seed-${seedCounter}`;
  const inserted = await db.pool.query<{ id: string }>(
    `INSERT INTO activities
       (agent_hash, source_row_id, public_id, source_execution_id, event_index, kind, event_role, status,
        protocol, chain_family, chain_id, usd_in_est, tx_hash,
        client_created_at, client_confirmed_at, statuses_seen, verification_state, received_schema_version)
     VALUES ($1, $2, $2, $2, 0, 'swap', 'swap', $6, $5, 'eip155', 8453, '7.5', $3,
             now() - interval '1 hour', '2026-07-29T10:00:00Z', ARRAY['pending', $6::text], $4, 1)
     RETURNING id`,
    [agentHash, rowKey, `0xtx-${rowKey}`, verificationState, protocol, status],
  );
  return { activityId: BigInt(onlyRow(inserted.rows).id), publicId: rowKey };
}

async function txCountOf(protocol: string): Promise<number> {
  const result = await db.pool.query<{ tx_count: number }>(
    "SELECT COALESCE(sum(tx_count), 0)::int AS tx_count FROM daily_aggregates WHERE protocol = $1",
    [protocol],
  );
  return onlyRow(result.rows).tx_count;
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

  it("verify retry requeues an unverifiable activity and inserts a due job with zero attempts in one transaction outcome", async () => {
    const { activityId, publicId } = await seedActivity(activeAgent, "none");

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

    expect(outcome).toEqual({ requeued: false, refusal: "not_found" });
  });

  it("verify retry refuses a finalized activity so a worker pass cannot double-count it", async () => {
    const { activityId, publicId } = await seedActivity(activeAgent, "verified_full", "p-retry-guard");

    const outcome = await retryVerification(db.pool, publicId);

    expect(outcome).toEqual({
      requeued: false,
      refusal: "not_retryable",
      state: "verified_full",
      status: "confirmed",
    });
    expect(await verificationStateOf(activityId)).toBe("verified_full");
    const job = await db.pool.query("SELECT 1 FROM verification_jobs WHERE activity_id = $1", [
      activityId.toString(),
    ]);
    expect(job.rows).toEqual([]);
    await finalizeVerification(
      db.pool,
      activityId,
      { result: "verified_full", blockTimestamp: new Date("2026-07-29T10:00:00Z") },
      config,
    );
    expect(await txCountOf("p-retry-guard")).toBe(0);
  });

  it("verify retry resurrects an unverifiable activity whose verify cycle then counts it exactly once", async () => {
    const { activityId, publicId } = await seedActivity(activeAgent, "none", "p-retry-once");
    const verdict = { result: "verified_full", blockTimestamp: new Date("2026-07-29T10:00:00Z") } as const;

    const first = await retryVerification(db.pool, publicId);
    await finalizeVerification(db.pool, activityId, verdict, config);
    const second = await retryVerification(db.pool, publicId);
    await finalizeVerification(db.pool, activityId, verdict, config);

    expect(first).toEqual({ requeued: true });
    expect(second).toEqual({
      requeued: false,
      refusal: "not_retryable",
      state: "verified_full",
      status: "confirmed",
    });
    expect(await verificationStateOf(activityId)).toBe("verified_full");
    expect(await txCountOf("p-retry-once")).toBe(1);
  });

  it("verify retry refuses an activity the client reported as failed", async () => {
    const { activityId, publicId } = await seedActivity(activeAgent, "none", "p-cli", "definitively_failed");

    const outcome = await retryVerification(db.pool, publicId);

    expect(outcome).toEqual({
      requeued: false,
      refusal: "not_retryable",
      state: "none",
      status: "definitively_failed",
    });
    expect(await verificationStateOf(activityId)).toBe("none");
    const job = await db.pool.query("SELECT 1 FROM verification_jobs WHERE activity_id = $1", [
      activityId.toString(),
    ]);
    expect(job.rows).toEqual([]);
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

  it("attestation revoke stamps revoked_at and revoke_reason on every row for the token, across signers", async () => {
    const chainId = 4663n;
    const tokenAddress = `0x${"7".repeat(40)}`;
    await insertAttestationRow(chainId, tokenAddress, `0x${"1".repeat(40)}`);
    await insertAttestationRow(chainId, tokenAddress, `0x${"2".repeat(40)}`);
    const otherTokenAddress = `0x${"8".repeat(40)}`;
    await insertAttestationRow(chainId, otherTokenAddress, `0x${"3".repeat(40)}`);

    const outcome = await revokeTokenAttestations(db.pool, chainId, tokenAddress, "creator requested removal");

    expect(outcome).toEqual({ revokedCount: 2 });
    const revoked = await attestationRowsFor(chainId, tokenAddress);
    expect(revoked).toHaveLength(2);
    expect(revoked.every((row) => row.revoked_at !== null)).toBe(true);
    expect(revoked.every((row) => row.revoke_reason === "creator requested removal")).toBe(true);
    const untouched = await attestationRowsFor(chainId, otherTokenAddress);
    expect(untouched[0]?.revoked_at).toBeNull();
  });

  it("attestation revoke is idempotent: a second call revokes zero further rows", async () => {
    const chainId = 4663n;
    const tokenAddress = `0x${"9".repeat(40)}`;
    await insertAttestationRow(chainId, tokenAddress, `0x${"4".repeat(40)}`);

    const first = await revokeTokenAttestations(db.pool, chainId, tokenAddress, "first reason");
    const second = await revokeTokenAttestations(db.pool, chainId, tokenAddress, "second reason");

    expect(first).toEqual({ revokedCount: 1 });
    expect(second).toEqual({ revokedCount: 0 });
    const rows = await attestationRowsFor(chainId, tokenAddress);
    expect(rows[0]?.revoke_reason).toBe("first reason");
  });
});

async function insertAttestationRow(chainId: bigint, tokenAddress: string, recoveredSigner: string): Promise<void> {
  await db.pool.query(
    `INSERT INTO token_attestations (chain_id, token_address, recovered_signer, attest_signature)
     VALUES ($1, $2, $3, 'sig')`,
    [chainId.toString(), tokenAddress, recoveredSigner],
  );
}

async function attestationRowsFor(
  chainId: bigint,
  tokenAddress: string,
): Promise<{ revoked_at: Date | null; revoke_reason: string | null }[]> {
  const result = await db.pool.query<{ revoked_at: Date | null; revoke_reason: string | null }>(
    "SELECT revoked_at, revoke_reason FROM token_attestations WHERE chain_id = $1 AND token_address = $2 ORDER BY id",
    [chainId.toString(), tokenAddress],
  );
  return result.rows;
}

describe("verify reopen, withdrawing a verdict that should never have been issued", () => {
  const struckAgent = "a".repeat(64);

  async function seedStrike(agentHash: string, activityId: bigint): Promise<void> {
    await db.pool.query("INSERT INTO strikes (agent_hash, activity_id, reason) VALUES ($1, $2, $3)", [
      agentHash,
      activityId.toString(),
      "amount_mismatch",
    ]);
  }

  async function strikeRowsOf(agentHash: string): Promise<{ activity_id: string | null; reason: string }[]> {
    const result = await db.pool.query<{ activity_id: string | null; reason: string }>(
      "SELECT activity_id, reason FROM strikes WHERE agent_hash = $1 ORDER BY id",
      [agentHash],
    );
    return result.rows;
  }

  it("requeues the activity and withdraws the strike that verdict produced", async () => {
    const agentHash = `${struckAgent.slice(0, 63)}1`;
    await seedAgent(agentHash, { strikeCount: 1 });
    const { activityId, publicId } = await seedActivity(agentHash, "mismatch");
    await seedStrike(agentHash, activityId);

    const outcome = await reopenVerification(db.pool, publicId, config.QUARANTINE_STRIKES);

    expect(outcome).toEqual({ reopened: true, strikesWithdrawn: 1, quarantineLifted: false });
    expect(await verificationStateOf(activityId)).toBe("queued");
    expect(await agentRowOf(agentHash)).toEqual({ status: "active", strike_count: 0 });
    expect(await strikeRowsOf(agentHash)).toEqual([{ activity_id: null, reason: "operator_reopen" }]);
  });

  it("returns a quarantined agent to active once its strikes fall below the threshold", async () => {
    const agentHash = `${struckAgent.slice(0, 63)}2`;
    await seedAgent(agentHash, {
      status: "quarantined",
      strikeCount: config.QUARANTINE_STRIKES,
      quarantinedAt: "2026-08-20T06:41:12Z",
    });
    const { activityId, publicId } = await seedActivity(agentHash, "mismatch");
    await seedStrike(agentHash, activityId);

    const outcome = await reopenVerification(db.pool, publicId, config.QUARANTINE_STRIKES);

    expect(outcome).toEqual({ reopened: true, strikesWithdrawn: 1, quarantineLifted: true });
    expect(await agentRowOf(agentHash)).toEqual({
      status: "active",
      strike_count: config.QUARANTINE_STRIKES - 1,
    });
  });

  it("keeps an agent quarantined while the strikes it still carries reach the threshold", async () => {
    const agentHash = `${struckAgent.slice(0, 63)}3`;
    await seedAgent(agentHash, {
      status: "quarantined",
      strikeCount: config.QUARANTINE_STRIKES + 1,
      quarantinedAt: "2026-08-20T06:41:12Z",
    });
    const { activityId, publicId } = await seedActivity(agentHash, "mismatch");
    await seedStrike(agentHash, activityId);

    const outcome = await reopenVerification(db.pool, publicId, config.QUARANTINE_STRIKES);

    expect(outcome).toEqual({ reopened: true, strikesWithdrawn: 1, quarantineLifted: false });
    expect((await agentRowOf(agentHash)).status).toBe("quarantined");
  });

  it("withdraws only the strike of the named activity and leaves the others standing", async () => {
    const agentHash = `${struckAgent.slice(0, 63)}4`;
    await seedAgent(agentHash, { strikeCount: 2 });
    const wrongful = await seedActivity(agentHash, "mismatch");
    const untouched = await seedActivity(agentHash, "mismatch");
    await seedStrike(agentHash, wrongful.activityId);
    await seedStrike(agentHash, untouched.activityId);

    await reopenVerification(db.pool, wrongful.publicId, config.QUARANTINE_STRIKES);

    expect(await agentRowOf(agentHash)).toEqual({ status: "active", strike_count: 1 });
    expect(await verificationStateOf(untouched.activityId)).toBe("mismatch");
    const remaining = await strikeRowsOf(agentHash);
    expect(remaining.map((row) => row.activity_id)).toEqual([untouched.activityId.toString(), null]);
  });

  it("queues a due verification job with no attempts behind it", async () => {
    const agentHash = `${struckAgent.slice(0, 63)}5`;
    await seedAgent(agentHash, { strikeCount: 1 });
    const { activityId, publicId } = await seedActivity(agentHash, "mismatch");
    await seedStrike(agentHash, activityId);

    await reopenVerification(db.pool, publicId, config.QUARANTINE_STRIKES);

    const job = await db.pool.query<{ attempts: number; due: boolean }>(
      "SELECT attempts, next_attempt_at <= now() AS due FROM verification_jobs WHERE activity_id = $1",
      [activityId.toString()],
    );
    expect(onlyRow(job.rows)).toEqual({ attempts: 0, due: true });
  });

  it("refuses an activity that carries no mismatch verdict", async () => {
    const agentHash = `${struckAgent.slice(0, 63)}6`;
    await seedAgent(agentHash);
    const { publicId } = await seedActivity(agentHash, "verified_full");

    expect(await reopenVerification(db.pool, publicId, config.QUARANTINE_STRIKES)).toEqual({
      reopened: false,
      refusal: "not_reopenable",
      state: "verified_full",
      status: "confirmed",
    });
  });

  it("reports an unknown public id without touching anything", async () => {
    expect(await reopenVerification(db.pool, "no-such-public-id", config.QUARANTINE_STRIKES)).toEqual({
      reopened: false,
      refusal: "not_found",
    });
  });
});
