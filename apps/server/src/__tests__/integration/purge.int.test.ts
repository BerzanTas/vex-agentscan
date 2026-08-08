import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../config.js";
import { startTestDb } from "../../testing/pg-harness.js";
import { runPurgeSweep } from "../../worker/purge.js";

const config = loadConfig({ DATABASE_URL: "postgres://unused-in-tests" });

const dueAgent = "b".repeat(64);
const recentAgent = "c".repeat(64);

let db: Awaited<ReturnType<typeof startTestDb>>;
let seedCounter = 0;
let dueActivityId = 0n;
let recentActivityId = 0n;

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

async function seedRevokedAgent(agentHash: string, revokedHoursAgo: number): Promise<void> {
  await db.pool.query(
    `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, status, revoked_at)
     VALUES ($1, 'sha', 1, now(), 'revoked', now() - make_interval(hours => $2))`,
    [agentHash, revokedHoursAgo],
  );
}

async function seedQueuedActivityWithJob(agentHash: string, protocol: string): Promise<bigint> {
  seedCounter += 1;
  const rowKey = `purge-seed-${seedCounter}`;
  const inserted = await db.pool.query<{ id: string }>(
    `INSERT INTO activities
       (agent_hash, source_row_id, public_id, source_execution_id, event_index, kind, event_role, status,
        protocol, chain_family, chain_id, tx_hash,
        client_created_at, statuses_seen, verification_state, received_schema_version)
     VALUES ($1, $2, $2, $2, 0, 'swap', 'swap', 'confirmed', $3, 'eip155', 8453, $4,
             now() - interval '1 hour', ARRAY['pending','confirmed'], 'queued', 1)
     RETURNING id`,
    [agentHash, rowKey, protocol, `0xtx-${rowKey}`],
  );
  const activityId = BigInt(onlyRow(inserted.rows).id);
  await db.pool.query("INSERT INTO verification_jobs (activity_id, next_attempt_at) VALUES ($1, now())", [
    activityId.toString(),
  ]);
  return activityId;
}

async function seedStrike(agentHash: string): Promise<void> {
  await db.pool.query("INSERT INTO strikes (agent_hash, reason) VALUES ($1, 'tx_reverted')", [agentHash]);
}

async function seedAgentWallet(agentHash: string, addressHmac: string): Promise<void> {
  await db.pool.query(
    "INSERT INTO agent_wallets (agent_hash, chain_family, address_hmac, proof_signature) VALUES ($1, 'eip155', $2, 'sig')",
    [agentHash, addressHmac],
  );
}

async function countWallets(agentHash: string): Promise<number> {
  const result = await db.pool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM agent_wallets WHERE agent_hash = $1",
    [agentHash],
  );
  return onlyRow(result.rows).count;
}

async function seedAggregate(protocol: string): Promise<void> {
  await db.pool.query(
    "INSERT INTO daily_aggregates (day, protocol, kind, volume_usd, tx_count) VALUES ('2026-07-28', $1, 'swap', 12.5, 3)",
    [protocol],
  );
}

async function countActivities(agentHash: string): Promise<number> {
  const result = await db.pool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM activities WHERE agent_hash = $1",
    [agentHash],
  );
  return onlyRow(result.rows).count;
}

async function countJobs(activityId: bigint): Promise<number> {
  const result = await db.pool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM verification_jobs WHERE activity_id = $1",
    [activityId.toString()],
  );
  return onlyRow(result.rows).count;
}

async function countStrikes(agentHash: string): Promise<number> {
  const result = await db.pool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM strikes WHERE agent_hash = $1",
    [agentHash],
  );
  return onlyRow(result.rows).count;
}

async function purgedAtOf(agentHash: string): Promise<Date | null> {
  const result = await db.pool.query<{ purged_at: Date | null }>(
    "SELECT purged_at FROM agents WHERE agent_hash = $1",
    [agentHash],
  );
  return onlyRow(result.rows).purged_at;
}

async function aggregateOf(protocol: string): Promise<{ day: string; kind: string; volume_usd: string; tx_count: number }> {
  const result = await db.pool.query<{ day: string; kind: string; volume_usd: string; tx_count: number }>(
    "SELECT day::text AS day, kind, volume_usd::text AS volume_usd, tx_count FROM daily_aggregates WHERE protocol = $1",
    [protocol],
  );
  return onlyRow(result.rows);
}

async function seedRateLimitHit(keyHash: string, updatedMinutesAgo: number): Promise<void> {
  await db.pool.query(
    `INSERT INTO rate_limit_hits (key_hash, hits, updated_at)
     VALUES ($1, ARRAY[now()]::timestamptz[], now() - make_interval(mins => $2))`,
    [keyHash, updatedMinutesAgo],
  );
}

async function rateLimitHitExists(keyHash: string): Promise<boolean> {
  const result = await db.pool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM rate_limit_hits WHERE key_hash = $1",
    [keyHash],
  );
  return onlyRow(result.rows).count > 0;
}

async function seedHandshakeChallenge(nonce: string, createdHoursAgo: number): Promise<string> {
  const inserted = await db.pool.query<{ id: string }>(
    `INSERT INTO handshake_challenges (agent_hash, nonce, domain, address_hmacs, created_at, expires_at)
     VALUES ($1, $2, 'localhost', ARRAY['hmac'], now() - make_interval(hours => $3), now() - make_interval(hours => $3) + interval '5 minutes')
     RETURNING id`,
    [dueAgent, nonce, createdHoursAgo],
  );
  return onlyRow(inserted.rows).id;
}

async function handshakeChallengeExists(id: string): Promise<boolean> {
  const result = await db.pool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM handshake_challenges WHERE id = $1",
    [id],
  );
  return onlyRow(result.rows).count > 0;
}

describe("purge sweep", () => {
  it("purges activities, verification jobs, strikes and wallet hmacs of an agent revoked past PURGE_DELAY_H, stamps purged_at and leaves daily_aggregates untouched", async () => {
    await seedRevokedAgent(dueAgent, 25);
    dueActivityId = await seedQueuedActivityWithJob(dueAgent, "p-purge-due");
    await seedStrike(dueAgent);
    await seedAgentWallet(dueAgent, "hmac-purge-due");
    await seedAggregate("p-purge-due");

    const outcome = await runPurgeSweep(db.pool, config);

    expect(outcome).toEqual({ purgedAgents: 1 });
    expect(await countActivities(dueAgent)).toBe(0);
    expect(await countJobs(dueActivityId)).toBe(0);
    expect(await countStrikes(dueAgent)).toBe(0);
    expect(await countWallets(dueAgent)).toBe(0);
    expect(await purgedAtOf(dueAgent)).not.toBeNull();
    expect(await aggregateOf("p-purge-due")).toEqual({
      day: "2026-07-28",
      kind: "swap",
      volume_usd: "12.5",
      tx_count: 3,
    });
  });

  it("leaves an agent revoked less than PURGE_DELAY_H ago untouched", async () => {
    await seedRevokedAgent(recentAgent, 1);
    recentActivityId = await seedQueuedActivityWithJob(recentAgent, "p-purge-recent");
    await seedStrike(recentAgent);
    await seedAgentWallet(recentAgent, "hmac-purge-recent");

    const outcome = await runPurgeSweep(db.pool, config);

    expect(outcome).toEqual({ purgedAgents: 0 });
    expect(await countActivities(recentAgent)).toBe(1);
    expect(await countJobs(recentActivityId)).toBe(1);
    expect(await countStrikes(recentAgent)).toBe(1);
    expect(await countWallets(recentAgent)).toBe(1);
    expect(await purgedAtOf(recentAgent)).toBeNull();
  });

  it("is idempotent: a second sweep purges no agents and keeps purged_at unchanged", async () => {
    const stampBefore = await purgedAtOf(dueAgent);

    const outcome = await runPurgeSweep(db.pool, config);

    expect(outcome).toEqual({ purgedAgents: 0 });
    expect(await purgedAtOf(dueAgent)).toEqual(stampBefore);
    expect(await countActivities(recentAgent)).toBe(1);
    expect(await countJobs(recentActivityId)).toBe(1);
  });

  it("re-purges a restored activity of an already-purged revoked agent because the sweep filters by status, not purged_at", async () => {
    const restoredActivityId = await seedQueuedActivityWithJob(dueAgent, "p-purge-restored");

    const outcome = await runPurgeSweep(db.pool, config);

    expect(outcome).toEqual({ purgedAgents: 1 });
    expect(await countActivities(dueAgent)).toBe(0);
    expect(await countJobs(restoredActivityId)).toBe(0);
    expect(await countActivities(recentAgent)).toBe(1);
  });

  it("keeps a rate limit counter that is inside the register window but outside the ingest window", async () => {
    await seedRateLimitHit("rate-limit-within-register-window", 10);

    await runPurgeSweep(db.pool, config);

    expect(await rateLimitHitExists("rate-limit-within-register-window")).toBe(true);
  });

  it("deletes a rate limit counter that is outside both the ingest and register windows", async () => {
    await seedRateLimitHit("rate-limit-outside-both-windows", 120);

    await runPurgeSweep(db.pool, config);

    expect(await rateLimitHitExists("rate-limit-outside-both-windows")).toBe(false);
  });

  it("keeps a rate limit counter inside a widened HANDSHAKE_RATE_WINDOW_SEC that the default ingest/register windows alone would have swept", async () => {
    const widerConfig = loadConfig({
      DATABASE_URL: "postgres://unused-in-tests",
      HANDSHAKE_RATE_WINDOW_SEC: "7200",
    });
    await seedRateLimitHit("rate-limit-within-widened-handshake-window", 90);

    await runPurgeSweep(db.pool, widerConfig);

    expect(await rateLimitHitExists("rate-limit-within-widened-handshake-window")).toBe(true);
  });

  it("deletes a handshake challenge created more than an hour ago and keeps a recent one", async () => {
    const oldChallengeId = await seedHandshakeChallenge("purge-sweep-old-nonce", 2);
    const recentChallengeId = await seedHandshakeChallenge("purge-sweep-recent-nonce", 0);

    await runPurgeSweep(db.pool, config);

    expect(await handshakeChallengeExists(oldChallengeId)).toBe(false);
    expect(await handshakeChallengeExists(recentChallengeId)).toBe(true);
  });
});
