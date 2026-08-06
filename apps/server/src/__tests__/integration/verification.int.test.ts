import { fastify, type FastifyInstance } from "fastify";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveBridgeChain, resolveChain } from "@agentscan/core";
import { loadConfig } from "../../config.js";
import type { VerificationStatsDto } from "../../public-dto.js";
import { verificationRoutes } from "../../routes/public/verification.js";
import { startTestDb } from "../../testing/pg-harness.js";
import {
  evmChains,
  solanaChains,
} from "../../../../../packages/core/src/chain-registry/chains.js";

const agentHash = "e".repeat(64);

const registryChainSlugs = new Set(
  [...evmChains, ...solanaChains].map((chain) => chain.entry.canonicalSlug),
);

type TerminalSeed = { sourceRowId: string; verificationState: string; latencySeconds: number | null };

async function seedTerminalActivity(pool: pg.Pool, seed: TerminalSeed): Promise<void> {
  await pool.query(
    `INSERT INTO activities
       (agent_hash, source_row_id, public_id, source_execution_id, event_index, kind, event_role, status,
        protocol, chain_family, chain_id, usd_in_est, tx_hash,
        client_created_at, client_confirmed_at, statuses_seen, verification_state, verified_at,
        received_at, received_schema_version)
     VALUES ($1, $2, $2, 'exec-terminal', 0, 'swap', 'swap', 'confirmed',
             'kyberswap', 'eip155', 8453, 100.00, '0xabc',
             now() - interval '2 hours',
             CASE WHEN $4::int IS NULL THEN NULL ELSE now() - interval '1 hour' END,
             ARRAY['confirmed'], $3,
             CASE WHEN $4::int IS NULL THEN now()
                  ELSE now() - interval '1 hour' + make_interval(secs => $4::int) END,
             now(), 1)`,
    [agentHash, seed.sourceRowId, seed.verificationState, seed.latencySeconds],
  );
}

type AwaitingSeed = { sourceRowId: string; verificationState: string; scheduled: boolean };

async function seedAwaitingActivity(pool: pg.Pool, seed: AwaitingSeed): Promise<void> {
  await pool.query(
    `WITH inserted AS (
       INSERT INTO activities
         (agent_hash, source_row_id, public_id, source_execution_id, event_index, kind, event_role, status,
          protocol, chain_family, chain_id, tx_hash,
          client_created_at, client_confirmed_at, statuses_seen, verification_state,
          received_at, received_schema_version)
       VALUES ($1, $2, $2, 'exec-awaiting', 0, 'swap', 'swap', 'confirmed',
               'kyberswap', 'eip155', 8453, '0xabc',
               now() - interval '2 hours', now() - interval '1 hour',
               ARRAY['confirmed'], $3, now(), 1)
       RETURNING id
     )
     INSERT INTO verification_jobs (activity_id, next_attempt_at)
     SELECT id, now() FROM inserted WHERE $4::bool`,
    [agentHash, seed.sourceRowId, seed.verificationState, seed.scheduled],
  );
}

async function buildVerificationApp(pool: pg.Pool): Promise<FastifyInstance> {
  const app = fastify();
  await app.register(verificationRoutes, {
    pool,
    config: loadConfig({ DATABASE_URL: "postgres://unused-in-tests" }),
    resolveChain,
    resolveBridgeChain,
  });
  return app;
}

async function fetchVerificationStats(app: FastifyInstance): Promise<VerificationStatsDto> {
  const response = await app.inject({ method: "GET", url: "/api/verification" });
  expect(response.statusCode).toBe(200);
  return response.json<VerificationStatsDto>();
}

let db: Awaited<ReturnType<typeof startTestDb>>;
let emptyDbApp: FastifyInstance;
let seededApp: FastifyInstance;

beforeAll(async () => {
  db = await startTestDb();
  emptyDbApp = await buildVerificationApp(db.pool);
  seededApp = await buildVerificationApp(db.pool);
}, 120_000);

afterAll(async () => {
  await emptyDbApp.close();
  await seededApp.close();
  await db.stop();
});

describe("GET /api/verification on an empty database", () => {
  it("answers zero counters", async () => {
    const stats = await fetchVerificationStats(emptyDbApp);

    expect([stats.verifiedFull, stats.verifiedBasic, stats.queued]).toEqual([0, 0, 0]);
  });

  it("answers null latency percentiles instead of zero seconds", async () => {
    const stats = await fetchVerificationStats(emptyDbApp);

    expect(stats.latencySeconds).toEqual({ median: null, p90: null });
  });

  it("lists one tier row per canonical chain of the registry", async () => {
    const stats = await fetchVerificationStats(emptyDbApp);

    expect(stats.chains).toHaveLength(registryChainSlugs.size);
  });

  it("takes the tier of each chain from the registry", async () => {
    const stats = await fetchVerificationStats(emptyDbApp);

    expect(stats.chains).toContainEqual({ chainSlug: "base", displayName: "Base", verificationTier: "full" });
    expect(stats.chains).toContainEqual({ chainSlug: "solana", displayName: "Solana", verificationTier: "basic" });
  });
});

describe("GET /api/verification with seeded activity", () => {
  beforeAll(async () => {
    await db.pool.query(
      `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, first_verified_at)
       VALUES ($1, 'token-sha', 1, now(), now())`,
      [agentHash],
    );
    await seedTerminalActivity(db.pool, { sourceRowId: "row-full-fast", verificationState: "verified_full", latencySeconds: 10 });
    await seedTerminalActivity(db.pool, { sourceRowId: "row-full-slow", verificationState: "verified_full", latencySeconds: 30 });
    await seedTerminalActivity(db.pool, { sourceRowId: "row-basic", verificationState: "verified_basic", latencySeconds: 20 });
    await seedTerminalActivity(db.pool, { sourceRowId: "row-full-unconfirmed", verificationState: "verified_full", latencySeconds: null });
    await seedTerminalActivity(db.pool, { sourceRowId: "row-mismatch", verificationState: "mismatch", latencySeconds: 3600 });
    await seedAwaitingActivity(db.pool, { sourceRowId: "row-queued-scheduled", verificationState: "queued", scheduled: true });
    await seedAwaitingActivity(db.pool, { sourceRowId: "row-queued-unscheduled", verificationState: "queued", scheduled: false });
    await seedAwaitingActivity(db.pool, { sourceRowId: "row-none-scheduled", verificationState: "none", scheduled: true });
    await seedAwaitingActivity(db.pool, { sourceRowId: "row-none-unscheduled", verificationState: "none", scheduled: false });
  });

  it("splits the verified rows into full and basic as seeded", async () => {
    const stats = await fetchVerificationStats(seededApp);

    expect([stats.verifiedFull, stats.verifiedBasic]).toEqual([3, 1]);
  });

  it("counts as queued only the rows awaiting verification that have a scheduled job", async () => {
    const stats = await fetchVerificationStats(seededApp);

    expect(stats.queued).toBe(2);
  });

  it("leaves the mismatch row out of every counter and out of the payload", async () => {
    const stats = await fetchVerificationStats(seededApp);

    expect([stats.verifiedFull, stats.verifiedBasic, stats.queued]).toEqual([3, 1, 2]);
    expect(JSON.stringify(stats)).not.toMatch(/mismatch|strike/);
  });

  it("excludes rows without a client confirmation time from the latency percentiles", async () => {
    const stats = await fetchVerificationStats(seededApp);

    expect(stats.latencySeconds).toEqual({ median: 20, p90: 28 });
  });
});
