import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EventStatus } from "@agentscan/contract";
import { resolveChain, type ChainReader, type ReceiptView } from "@agentscan/core";
import { loadConfig } from "../../config.js";
import { claimDueJobs, finalizeVerification } from "../../repos/activities-verify-repo.js";
import { startTestDb } from "../../testing/pg-harness.js";
import { makeChainReader } from "../../verification/viem-chain-reader.js";
import { runVerificationPass, type VerificationLoopDeps } from "../../worker/loop.js";

const config = loadConfig({
  DATABASE_URL: "postgres://unused-in-tests",
  VERIFY_BACKOFF_SCHEDULE: "1m,5m",
});

const logger = pino({ level: "silent" });

let db: Awaited<ReturnType<typeof startTestDb>>;
let seedCounter = 0;

beforeAll(async () => {
  db = await startTestDb();
});

afterAll(async () => {
  await db.stop();
});

const depsWithReader = (reader: ChainReader): VerificationLoopDeps => ({
  pool: db.pool,
  config,
  now: () => new Date(),
  resolveChain,
  chainReaderFor: () => reader,
  logger,
});

const readerReturning = (receipt: ReceiptView | null): ChainReader => ({
  getReceipt: () => Promise.resolve(receipt),
});

const throwingReader: ChainReader = {
  getReceipt: () => Promise.reject(new Error("rpc unreachable")),
};

function onlyRow<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error("expected exactly one row");
  return row;
}

async function seedAgent(agentHash: string): Promise<void> {
  await db.pool.query(
    "INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at) VALUES ($1, 'sha', 1, now())",
    [agentHash],
  );
}

type QueuedActivitySeed = {
  agentHash: string;
  protocol?: string;
  kind?: "swap" | "bridge" | "launch";
  status?: EventStatus;
  eventRole?: string;
  chainId?: number;
  usdInEst?: string | null;
  clientConfirmedAt?: Date | null;
  executedInRaw?: string | null;
  executedOutRaw?: string | null;
  tokenInAddress?: string | null;
  tokenOutAddress?: string | null;
  firstAttemptAt?: Date;
  attempts?: number;
};

async function seedQueuedActivity(seed: QueuedActivitySeed): Promise<bigint> {
  seedCounter += 1;
  const rowKey = `verify-seed-${seedCounter}`;
  const inserted = await db.pool.query<{ id: string }>(
    `INSERT INTO activities
       (agent_hash, source_row_id, public_id, source_execution_id, event_index, kind, event_role, status,
        protocol, chain_family, chain_id, token_in_address, token_out_address,
        executed_in_raw, executed_out_raw, usd_in_est, tx_hash,
        client_created_at, client_confirmed_at, statuses_seen, verification_state, received_schema_version)
     VALUES ($1, $2, $2, $2, 0, $3, $4, $14, $5, 'eip155', $6, $7, $8, $9, $10, $11, $12,
             now() - interval '1 hour', $13, ARRAY['pending', $14], 'queued', 1)
     RETURNING id`,
    [
      seed.agentHash,
      rowKey,
      seed.kind ?? "swap",
      seed.eventRole ?? "swap",
      seed.protocol ?? "p-default",
      seed.chainId ?? 8453,
      seed.tokenInAddress ?? null,
      seed.tokenOutAddress ?? null,
      seed.executedInRaw ?? null,
      seed.executedOutRaw ?? null,
      seed.usdInEst ?? null,
      `0xtx-${seedCounter}`,
      seed.clientConfirmedAt === undefined ? new Date() : seed.clientConfirmedAt,
      seed.status ?? "confirmed",
    ],
  );
  const activityId = BigInt(onlyRow(inserted.rows).id);
  await db.pool.query(
    `INSERT INTO verification_jobs (activity_id, attempts, first_attempt_at, next_attempt_at)
     VALUES ($1, $2, $3, now() - interval '1 second')`,
    [activityId.toString(), seed.attempts ?? 0, seed.firstAttemptAt ?? new Date()],
  );
  return activityId;
}

async function activityStateOf(
  activityId: bigint,
): Promise<{ verification_state: string; verified_at: Date | null; block_time: Date | null }> {
  const result = await db.pool.query<{
    verification_state: string;
    verified_at: Date | null;
    block_time: Date | null;
  }>("SELECT verification_state, verified_at, block_time FROM activities WHERE id = $1", [activityId.toString()]);
  return onlyRow(result.rows);
}

async function jobRowOf(
  activityId: bigint,
): Promise<{ attempts: number; last_error: string | null; delay_sec: number } | null> {
  const result = await db.pool.query<{ attempts: number; last_error: string | null; delay_sec: number }>(
    `SELECT attempts, last_error, EXTRACT(EPOCH FROM (next_attempt_at - now()))::float8 AS delay_sec
     FROM verification_jobs WHERE activity_id = $1`,
    [activityId.toString()],
  );
  return result.rows[0] ?? null;
}

async function agentRowOf(
  agentHash: string,
): Promise<{ status: string; strike_count: number; first_verified_at: Date | null; quarantined_at: Date | null }> {
  const result = await db.pool.query<{
    status: string;
    strike_count: number;
    first_verified_at: Date | null;
    quarantined_at: Date | null;
  }>("SELECT status, strike_count, first_verified_at, quarantined_at FROM agents WHERE agent_hash = $1", [agentHash]);
  return onlyRow(result.rows);
}

async function strikesOf(agentHash: string): Promise<{ activity_id: string; reason: string }[]> {
  const result = await db.pool.query<{ activity_id: string; reason: string }>(
    "SELECT activity_id::text AS activity_id, reason FROM strikes WHERE agent_hash = $1 ORDER BY id",
    [agentHash],
  );
  return result.rows;
}

async function aggregateOf(protocol: string): Promise<{ day: string; kind: string; volume_usd: string; tx_count: number }> {
  const result = await db.pool.query<{ day: string; kind: string; volume_usd: string; tx_count: number }>(
    "SELECT day::text AS day, kind, volume_usd::text AS volume_usd, tx_count FROM daily_aggregates WHERE protocol = $1",
    [protocol],
  );
  return onlyRow(result.rows);
}

const eightDaysAgo = () => new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

describe("verification worker", () => {
  it("finalizes a matching receipt as verified_full, books volume under the client_confirmed_at day and marks first_verified_at", async () => {
    const agent = "1".repeat(64);
    await seedAgent(agent);
    const confirmedAt = new Date("2026-07-28T12:00:00.000Z");
    const activityId = await seedQueuedActivity({
      agentHash: agent,
      protocol: "p-success",
      usdInEst: "100.25",
      clientConfirmedAt: confirmedAt,
      executedInRaw: "1000000",
      executedOutRaw: "2000000",
      tokenInAddress: "0xaaa",
      tokenOutAddress: "0xbbb",
    });
    const receipt: ReceiptView = {
      status: "success",
      blockTimestamp: confirmedAt,
      erc20Transfers: [
        { token: "0xAAA", from: "0x1", to: "0x2", amountRaw: "1000000" },
        { token: "0xBBB", from: "0x2", to: "0x1", amountRaw: "2000000" },
      ],
      transactionValueRaw: null,
    };

    await runVerificationPass(depsWithReader(readerReturning(receipt)));

    const activity = await activityStateOf(activityId);
    expect(activity.verification_state).toBe("verified_full");
    expect(activity.verified_at).not.toBeNull();
    expect(await jobRowOf(activityId)).toBeNull();
    expect(await aggregateOf("p-success")).toEqual({
      day: "2026-07-28",
      kind: "swap",
      volume_usd: "100.25",
      tx_count: 1,
    });
    expect((await agentRowOf(agent)).first_verified_at).not.toBeNull();
  });

  it("persists the on-chain block time and books volume under it when the client sent no confirmation time", async () => {
    const agent = "c".repeat(64);
    await seedAgent(agent);
    const blockTimestamp = new Date("2026-07-26T23:30:00.000Z");
    const activityId = await seedQueuedActivity({
      agentHash: agent,
      protocol: "p-block-time",
      usdInEst: "40",
      clientConfirmedAt: null,
    });

    await runVerificationPass(
      depsWithReader(readerReturning({ status: "success", blockTimestamp, erc20Transfers: [], transactionValueRaw: null })),
    );

    expect((await activityStateOf(activityId)).block_time).toEqual(blockTimestamp);
    expect(await aggregateOf("p-block-time")).toEqual({
      day: "2026-07-26",
      kind: "swap",
      volume_usd: "40",
      tx_count: 1,
    });
  });

  it("leaves block_time null on a mismatch verdict, which carries no block timestamp", async () => {
    const agent = "d".repeat(64);
    await seedAgent(agent);
    const activityId = await seedQueuedActivity({ agentHash: agent, protocol: "p-reverted" });

    await runVerificationPass(
      depsWithReader(readerReturning({ status: "reverted", blockTimestamp: new Date(), erc20Transfers: [], transactionValueRaw: null })),
    );

    const activity = await activityStateOf(activityId);
    expect(activity.verification_state).toBe("mismatch");
    expect(activity.block_time).toBeNull();
  });

  it("adds bridge volume only for the bridge_deposit leg while counting every verified leg", async () => {
    const agent = "2".repeat(64);
    await seedAgent(agent);
    const confirmedAt = new Date("2026-07-27T09:00:00.000Z");
    await seedQueuedActivity({
      agentHash: agent,
      protocol: "p-bridge",
      kind: "bridge",
      eventRole: "bridge_deposit",
      usdInEst: "50.5",
      clientConfirmedAt: confirmedAt,
    });
    await seedQueuedActivity({
      agentHash: agent,
      protocol: "p-bridge",
      kind: "bridge",
      eventRole: "bridge_fill_observed",
      usdInEst: "70",
      clientConfirmedAt: confirmedAt,
    });
    const receipt: ReceiptView = { status: "success", blockTimestamp: confirmedAt, erc20Transfers: [], transactionValueRaw: null };

    await runVerificationPass(depsWithReader(readerReturning(receipt)));

    expect(await aggregateOf("p-bridge")).toEqual({
      day: "2026-07-27",
      kind: "bridge",
      volume_usd: "50.5",
      tx_count: 2,
    });
  });

  it("reschedules a missing receipt with attempts incremented and the first backoff interval", async () => {
    const agent = "3".repeat(64);
    await seedAgent(agent);
    const activityId = await seedQueuedActivity({ agentHash: agent, protocol: "p-retry" });

    await runVerificationPass(depsWithReader(readerReturning(null)));

    const job = await jobRowOf(activityId);
    expect(job).not.toBeNull();
    expect(job?.attempts).toBe(1);
    expect(job?.last_error).toBe("receipt_not_found");
    expect(job?.delay_sec).toBeGreaterThan(50);
    expect(job?.delay_sec).toBeLessThan(70);
    expect((await activityStateOf(activityId)).verification_state).toBe("queued");
  });

  it("repeats the last backoff interval once the schedule is exhausted", async () => {
    const agent = "3".repeat(64);
    const activityId = await seedQueuedActivity({ agentHash: agent, protocol: "p-retry-late", attempts: 7 });

    await runVerificationPass(depsWithReader(readerReturning(null)));

    const job = await jobRowOf(activityId);
    expect(job?.attempts).toBe(8);
    expect(job?.delay_sec).toBeGreaterThan(290);
    expect(job?.delay_sec).toBeLessThan(310);
  });

  it("strikes tx_not_found when the age cap has passed and the chain answered no such tx", async () => {
    const agent = "4".repeat(64);
    await seedAgent(agent);
    const activityId = await seedQueuedActivity({
      agentHash: agent,
      protocol: "p-cap-null",
      firstAttemptAt: eightDaysAgo(),
    });

    await runVerificationPass(depsWithReader(readerReturning(null)));

    expect((await activityStateOf(activityId)).verification_state).toBe("mismatch");
    expect(await strikesOf(agent)).toEqual([{ activity_id: activityId.toString(), reason: "tx_not_found" }]);
    expect((await agentRowOf(agent)).strike_count).toBe(1);
    expect(await jobRowOf(activityId)).toBeNull();
  });

  it("closes silently without a strike when the age cap has passed and the last read threw", async () => {
    const agent = "5".repeat(64);
    await seedAgent(agent);
    const activityId = await seedQueuedActivity({
      agentHash: agent,
      protocol: "p-cap-throw",
      firstAttemptAt: eightDaysAgo(),
    });

    await runVerificationPass(depsWithReader(throwingReader));

    const activity = await activityStateOf(activityId);
    expect(activity.verification_state).toBe("none");
    expect(activity.verified_at).toBeNull();
    expect(await jobRowOf(activityId)).toBeNull();
    expect(await strikesOf(agent)).toEqual([]);
    expect((await agentRowOf(agent)).strike_count).toBe(0);
  });

  it("backs off a chain outside the registry by UNKNOWN_CHAIN_BACKOFF_MIN without ever striking", async () => {
    const agent = "6".repeat(64);
    await seedAgent(agent);
    const activityId = await seedQueuedActivity({ agentHash: agent, protocol: "p-unknown", chainId: 999999 });

    await runVerificationPass(depsWithReader(readerReturning(null)));

    const job = await jobRowOf(activityId);
    expect(job?.attempts).toBe(1);
    expect(job?.delay_sec).toBeGreaterThan(21500);
    expect(job?.delay_sec).toBeLessThan(21700);
    expect(job?.last_error).toBe("chain_not_in_registry");
    expect((await activityStateOf(activityId)).verification_state).toBe("queued");
    expect(await strikesOf(agent)).toEqual([]);
    expect((await agentRowOf(agent)).strike_count).toBe(0);
  });

  it("quarantines an agent after three strikes across three activities", async () => {
    const agent = "7".repeat(64);
    await seedAgent(agent);
    await seedQueuedActivity({ agentHash: agent, protocol: "p-quarantine" });
    await seedQueuedActivity({ agentHash: agent, protocol: "p-quarantine" });
    await seedQueuedActivity({ agentHash: agent, protocol: "p-quarantine" });
    const reverted: ReceiptView = { status: "reverted", blockTimestamp: new Date(), erc20Transfers: [], transactionValueRaw: null };

    await runVerificationPass(depsWithReader(readerReturning(reverted)));

    const strikes = await strikesOf(agent);
    expect(strikes).toHaveLength(3);
    expect(strikes.map((strike) => strike.reason)).toEqual(["tx_reverted", "tx_reverted", "tx_reverted"]);
    const agentRow = await agentRowOf(agent);
    expect(agentRow.strike_count).toBe(3);
    expect(agentRow.status).toBe("quarantined");
    expect(agentRow.quarantined_at).not.toBeNull();
  });

  it("makes a second finalization pass a no-op through the CAS on verification_state", async () => {
    const agent = "8".repeat(64);
    await seedAgent(agent);
    const confirmedAt = new Date("2026-07-26T15:00:00.000Z");
    const activityId = await seedQueuedActivity({
      agentHash: agent,
      protocol: "p-idem",
      usdInEst: "10",
      clientConfirmedAt: confirmedAt,
    });
    const verdict = { result: "verified_full", blockTimestamp: confirmedAt } as const;

    await finalizeVerification(db.pool, activityId, verdict, config);
    await finalizeVerification(db.pool, activityId, verdict, config);

    expect((await activityStateOf(activityId)).verification_state).toBe("verified_full");
    expect(await aggregateOf("p-idem")).toEqual({
      day: "2026-07-26",
      kind: "swap",
      volume_usd: "10",
      tx_count: 1,
    });
  });

  it("books the aggregate day in UTC even when the session runs on a non-whole-hour timezone", async () => {
    const agent = "e".repeat(64);
    await seedAgent(agent);
    const lateUtcEvening = new Date("2026-07-24T23:50:00.000Z");
    const activityId = await seedQueuedActivity({
      agentHash: agent,
      protocol: "p-kathmandu",
      usdInEst: "15",
      clientConfirmedAt: lateUtcEvening,
    });
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL TIME ZONE 'Asia/Kathmandu'");
      await finalizeVerification(client, activityId, { result: "verified_full", blockTimestamp: lateUtcEvening }, config);
      await client.query("COMMIT");
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }

    expect(await aggregateOf("p-kathmandu")).toEqual({
      day: "2026-07-24",
      kind: "swap",
      volume_usd: "15",
      tx_count: 1,
    });
  });

  it("gives two concurrent claims disjoint job sets", async () => {
    await db.pool.query("DELETE FROM verification_jobs");
    const agent = "9".repeat(64);
    await seedAgent(agent);
    const seededIds = [
      await seedQueuedActivity({ agentHash: agent, protocol: "p-race" }),
      await seedQueuedActivity({ agentHash: agent, protocol: "p-race" }),
      await seedQueuedActivity({ agentHash: agent, protocol: "p-race" }),
      await seedQueuedActivity({ agentHash: agent, protocol: "p-race" }),
    ];
    const [firstClaim, secondClaim] = await Promise.all([
      claimDueJobs(db.pool, 2, config.WORKER_LEASE_SEC),
      claimDueJobs(db.pool, 2, config.WORKER_LEASE_SEC),
    ]);
    const firstIds = firstClaim.map((job) => job.activityId);
    const secondIds = secondClaim.map((job) => job.activityId);
    expect(firstIds).toHaveLength(2);
    expect(secondIds).toHaveLength(2);
    expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([]);
    expect([...firstIds, ...secondIds].sort()).toEqual([...seededIds].sort());
    await db.pool.query("DELETE FROM verification_jobs");
  });

  it("never claims a job whose activity ended superseded_unproven, so it can neither be verified nor struck", async () => {
    await db.pool.query("DELETE FROM verification_jobs");
    const agent = "f".repeat(64);
    await seedAgent(agent);
    const supersededId = await seedQueuedActivity({
      agentHash: agent,
      protocol: "p-superseded",
      status: "superseded_unproven",
    });
    const confirmedId = await seedQueuedActivity({ agentHash: agent, protocol: "p-still-claimed" });

    const claimed = await claimDueJobs(db.pool, 10, config.WORKER_LEASE_SEC);

    expect(claimed.map((job) => job.activityId)).toEqual([confirmedId]);
    expect((await activityStateOf(supersededId)).verification_state).toBe("queued");
    expect(await strikesOf(agent)).toEqual([]);
    await db.pool.query("DELETE FROM verification_jobs");
  });

  it("verifies a ten-day-old backfill event in confirm_all mode and books the aggregate under the historical day", async () => {
    const agent = "b".repeat(64);
    await seedAgent(agent);
    const confirmedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const expectedDay = confirmedAt.toISOString().slice(0, 10);
    const activityId = await seedQueuedActivity({
      agentHash: agent,
      protocol: "p-historical",
      usdInEst: "42.5",
      clientConfirmedAt: confirmedAt,
      executedInRaw: "999500000000000000",
      executedOutRaw: "2404191818181818181",
      tokenInAddress: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
      tokenOutAddress: "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2",
    });
    const fakeModeConfig = loadConfig({
      DATABASE_URL: "postgres://unused-in-tests",
      VERIFY_BACKOFF_SCHEDULE: "1m,5m",
      VERIFY_FAKE_MODE: "confirm_all",
    });

    await runVerificationPass({
      pool: db.pool,
      config: fakeModeConfig,
      now: () => new Date(),
      resolveChain,
      chainReaderFor: (entry, context) => makeChainReader(entry, fakeModeConfig, context),
      logger,
    });

    expect((await activityStateOf(activityId)).verification_state).toBe("verified_full");
    expect(await strikesOf(agent)).toEqual([]);
    expect(await aggregateOf("p-historical")).toEqual({
      day: expectedDay,
      kind: "swap",
      volume_usd: "42.5",
      tx_count: 1,
    });
  });

  it("caps a launch activity at verified_basic on a full-tier chain, never checking declared amounts", async () => {
    const agent = "c1".repeat(32);
    await seedAgent(agent);
    const activityId = await seedQueuedActivity({
      agentHash: agent,
      protocol: "p-launch-tier",
      kind: "launch",
      eventRole: "token_launch",
      chainId: 8453,
      tokenInAddress: "0xaaa",
      executedInRaw: "1000000",
    });
    const receipt: ReceiptView = { status: "success", blockTimestamp: new Date(), erc20Transfers: [], transactionValueRaw: null };

    await runVerificationPass(depsWithReader(readerReturning(receipt)));

    expect((await activityStateOf(activityId)).verification_state).toBe("verified_basic");
    expect(await strikesOf(agent)).toEqual([]);
  });

  it("marks a launch verification mismatch without incrementing strikes", async () => {
    const agent = "c2".repeat(32);
    await seedAgent(agent);
    const activityId = await seedQueuedActivity({
      agentHash: agent,
      protocol: "p-launch-mismatch",
      kind: "launch",
      eventRole: "token_launch",
    });
    const reverted: ReceiptView = { status: "reverted", blockTimestamp: new Date(), erc20Transfers: [], transactionValueRaw: null };

    await runVerificationPass(depsWithReader(readerReturning(reverted)));

    expect((await activityStateOf(activityId)).verification_state).toBe("mismatch");
    expect(await strikesOf(agent)).toEqual([]);
    expect((await agentRowOf(agent)).strike_count).toBe(0);
  });

  it("still increments strikes for a swap verification mismatch (regression guard)", async () => {
    const agent = "c3".repeat(32);
    await seedAgent(agent);
    const activityId = await seedQueuedActivity({ agentHash: agent, protocol: "p-swap-mismatch" });
    const reverted: ReceiptView = { status: "reverted", blockTimestamp: new Date(), erc20Transfers: [], transactionValueRaw: null };

    await runVerificationPass(depsWithReader(readerReturning(reverted)));

    expect((await activityStateOf(activityId)).verification_state).toBe("mismatch");
    expect(await strikesOf(agent)).toHaveLength(1);
    expect((await agentRowOf(agent)).strike_count).toBe(1);
  });

  it("still increments strikes for a bridge verification mismatch (regression guard)", async () => {
    const agent = "c5".repeat(32);
    await seedAgent(agent);
    const activityId = await seedQueuedActivity({
      agentHash: agent,
      protocol: "p-bridge-mismatch",
      kind: "bridge",
      eventRole: "bridge_deposit",
    });
    const reverted: ReceiptView = { status: "reverted", blockTimestamp: new Date(), erc20Transfers: [], transactionValueRaw: null };

    await runVerificationPass(depsWithReader(readerReturning(reverted)));

    expect((await activityStateOf(activityId)).verification_state).toBe("mismatch");
    expect(await strikesOf(agent)).toHaveLength(1);
    expect((await agentRowOf(agent)).strike_count).toBe(1);
  });

  it("strikes a launch-kind activity declaring a non-launch event role, closing the shape-mismatch exemption", async () => {
    const agent = "c6".repeat(32);
    await seedAgent(agent);
    const activityId = await seedQueuedActivity({
      agentHash: agent,
      protocol: "p-launch-spoofed-role",
      kind: "launch",
      eventRole: "swap",
    });
    const reverted: ReceiptView = { status: "reverted", blockTimestamp: new Date(), erc20Transfers: [], transactionValueRaw: null };

    await runVerificationPass(depsWithReader(readerReturning(reverted)));

    expect((await activityStateOf(activityId)).verification_state).toBe("mismatch");
    expect(await strikesOf(agent)).toEqual([{ activity_id: activityId.toString(), reason: "tx_reverted" }]);
    expect((await agentRowOf(agent)).strike_count).toBe(1);
  });

  it("quarantines an agent after three mismatches from launch-kind activities declaring a spoofed swap role", async () => {
    const agent = "c7".repeat(32);
    await seedAgent(agent);
    await seedQueuedActivity({ agentHash: agent, protocol: "p-launch-spoofed-quarantine", kind: "launch", eventRole: "swap" });
    await seedQueuedActivity({ agentHash: agent, protocol: "p-launch-spoofed-quarantine", kind: "launch", eventRole: "swap" });
    await seedQueuedActivity({ agentHash: agent, protocol: "p-launch-spoofed-quarantine", kind: "launch", eventRole: "swap" });
    const reverted: ReceiptView = { status: "reverted", blockTimestamp: new Date(), erc20Transfers: [], transactionValueRaw: null };

    await runVerificationPass(depsWithReader(readerReturning(reverted)));

    const agentRow = await agentRowOf(agent);
    expect(agentRow.strike_count).toBe(3);
    expect(agentRow.status).toBe("quarantined");
    expect(agentRow.quarantined_at).not.toBeNull();
  });

  it("books a verified launch under its own kind aggregate with zero volume but a counted transaction", async () => {
    const agent = "c4".repeat(32);
    await seedAgent(agent);
    const confirmedAt = new Date("2026-07-29T10:00:00.000Z");
    await seedQueuedActivity({
      agentHash: agent,
      protocol: "p-launch-agg",
      kind: "launch",
      eventRole: "token_launch",
      usdInEst: "500",
      clientConfirmedAt: confirmedAt,
    });
    const receipt: ReceiptView = { status: "success", blockTimestamp: confirmedAt, erc20Transfers: [], transactionValueRaw: null };

    await runVerificationPass(depsWithReader(readerReturning(receipt)));

    expect(await aggregateOf("p-launch-agg")).toEqual({
      day: "2026-07-29",
      kind: "launch",
      volume_usd: "0",
      tx_count: 1,
    });
  });

  it("books the aggregate under the verdict blockTimestamp day when client_confirmed_at is null", async () => {
    const agent = "a".repeat(64);
    await seedAgent(agent);
    await seedQueuedActivity({
      agentHash: agent,
      protocol: "p-nullconf",
      usdInEst: "5",
      clientConfirmedAt: null,
    });
    const receipt: ReceiptView = {
      status: "success",
      blockTimestamp: new Date("2026-07-25T23:30:00.000Z"),
      erc20Transfers: [],
      transactionValueRaw: null,
    };

    await runVerificationPass(depsWithReader(readerReturning(receipt)));

    expect(await aggregateOf("p-nullconf")).toEqual({
      day: "2026-07-25",
      kind: "swap",
      volume_usd: "5",
      tx_count: 1,
    });
  });
});
