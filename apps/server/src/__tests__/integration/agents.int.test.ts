import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type ResolveChain } from "../../app.js";
import { loadConfig } from "../../config.js";
import { agentAlias, type AgentStatDto } from "../../public-dto.js";
import { startTestDb } from "../../testing/pg-harness.js";
import { runPurgeSweep } from "../../worker/purge.js";

const config = loadConfig({ DATABASE_URL: "postgres://unused-in-tests", READ_CACHE_TTL_SEC: "0" });
const stubResolveChain: ResolveChain = () => null;

const hashOf = (index: number) => index.toString(16).padStart(2, "0").repeat(32);
const aliasOf = (index: number) => agentAlias(config.AGENT_ALIAS_SALT, hashOf(index));

let db: Awaited<ReturnType<typeof startTestDb>>;
let app: FastifyInstance;
let seedCounter = 0;

async function seedAgent(pool: pg.Pool, agentHash: string, revokedHoursAgo?: number): Promise<void> {
  await pool.query(
    `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, status, revoked_at)
     VALUES ($1, 'token-sha', 1, now(),
             CASE WHEN $2::int IS NULL THEN 'active' ELSE 'revoked' END,
             CASE WHEN $2::int IS NULL THEN NULL ELSE now() - make_interval(hours => $2) END)`,
    [agentHash, revokedHoursAgo ?? null],
  );
}

type ActivitySeed = {
  agentHash: string;
  eventRole?: string;
  status?: string;
  verificationState?: string;
  usdInEst: string | null;
  confirmedDaysAgo?: number;
};

async function seedActivity(pool: pg.Pool, seed: ActivitySeed): Promise<void> {
  seedCounter += 1;
  const rowKey = `agents-seed-${seedCounter}`;
  const eventRole = seed.eventRole ?? "swap";
  const status = seed.status ?? "confirmed";
  await pool.query(
    `INSERT INTO activities
       (agent_hash, source_row_id, public_id, source_execution_id, event_index, kind, event_role, status,
        protocol, chain_family, chain_id, usd_in_est, tx_hash,
        client_created_at, client_confirmed_at, statuses_seen, verification_state, received_schema_version)
     VALUES ($1, $2, $2, $2, 0, $3, $4, $5,
             'kyberswap', 'eip155', 8453, $6, $7,
             now() - make_interval(days => $8) - interval '1 hour',
             CASE WHEN $5 = 'pending' THEN NULL ELSE now() - make_interval(days => $8) END,
             ARRAY['pending'], $9, 1)`,
    [
      seed.agentHash,
      rowKey,
      eventRole === "swap" ? "swap" : "bridge",
      eventRole,
      status,
      seed.usdInEst,
      status === "pending" ? null : `0x${rowKey}`,
      seed.confirmedDaysAgo ?? 0,
      seed.verificationState ?? "verified_full",
    ],
  );
}

async function resetData(pool: pg.Pool): Promise<void> {
  await pool.query("TRUNCATE agents CASCADE");
}

async function leaderboardResponse(): Promise<AgentStatDto[]> {
  const response = await app.inject({ method: "GET", url: "/api/agents" });
  expect(response.statusCode).toBe(200);
  return response.json<AgentStatDto[]>();
}

beforeAll(async () => {
  db = await startTestDb();
  app = await buildApp({ pool: db.pool, config, resolveChain: stubResolveChain });
});

afterAll(async () => {
  await app.close();
  await db.stop();
});

describe("GET /api/agents", () => {
  it("serves an empty leaderboard on an empty database", async () => {
    expect(await leaderboardResponse()).toEqual([]);
  });

  describe("with eleven agents of descending volume", () => {
    beforeAll(async () => {
      await resetData(db.pool);
      for (let index = 0; index <= 10; index += 1) {
        await seedAgent(db.pool, hashOf(index));
        await seedActivity(db.pool, { agentHash: hashOf(index), usdInEst: String(1100 - index * 100) });
      }
    });

    it("serves the top 10 sorted by volume descending and drops the eleventh", async () => {
      const expected = Array.from({ length: 10 }, (_, index) => ({
        alias: aliasOf(index),
        name: null,
        volumeUsd: String(1100 - index * 100),
        txCount: 1,
        protocolCount: 1,
        chainCount: 1,
        lastSeenSeconds: expect.any(Number),
      }));
      expect(await leaderboardResponse()).toEqual(expected);
    });
  });

  describe("with activity older than the 30-day window", () => {
    beforeAll(async () => {
      await resetData(db.pool);
      await seedAgent(db.pool, hashOf(1));
      await seedActivity(db.pool, { agentHash: hashOf(1), usdInEst: "100.25", confirmedDaysAgo: 1 });
      await seedActivity(db.pool, { agentHash: hashOf(1), usdInEst: "500", confirmedDaysAgo: 31 });
      await seedAgent(db.pool, hashOf(2));
      await seedActivity(db.pool, { agentHash: hashOf(2), usdInEst: "400", confirmedDaysAgo: 40 });
    });

    it("counts only rows confirmed within the last 30 days", async () => {
      expect(await leaderboardResponse()).toEqual([
        {
          alias: aliasOf(1),
          name: null,
          volumeUsd: "100.25",
          txCount: 1,
          protocolCount: 1,
          chainCount: 1,
          lastSeenSeconds: expect.any(Number),
        },
      ]);
    });
  });

  describe("with pending and mismatch rows", () => {
    beforeAll(async () => {
      await resetData(db.pool);
      await seedAgent(db.pool, hashOf(3));
      await seedActivity(db.pool, { agentHash: hashOf(3), usdInEst: "50.5" });
      await seedActivity(db.pool, { agentHash: hashOf(3), status: "pending", verificationState: "none", usdInEst: "70" });
      await seedActivity(db.pool, { agentHash: hashOf(3), verificationState: "mismatch", usdInEst: "90" });
      await seedAgent(db.pool, hashOf(4));
      await seedActivity(db.pool, { agentHash: hashOf(4), status: "pending", verificationState: "none", usdInEst: "80" });
      await seedActivity(db.pool, { agentHash: hashOf(4), verificationState: "mismatch", usdInEst: "60" });
    });

    it("counts neither pending nor mismatch rows", async () => {
      expect(await leaderboardResponse()).toEqual([
        {
          alias: aliasOf(3),
          name: null,
          volumeUsd: "50.5",
          txCount: 1,
          protocolCount: 1,
          chainCount: 1,
          lastSeenSeconds: expect.any(Number),
        },
      ]);
    });
  });

  describe("with a verified bridge", () => {
    beforeAll(async () => {
      await resetData(db.pool);
      await seedAgent(db.pool, hashOf(5));
      await seedActivity(db.pool, { agentHash: hashOf(5), eventRole: "bridge_deposit", usdInEst: "300.75" });
      await seedActivity(db.pool, {
        agentHash: hashOf(5),
        eventRole: "bridge_fill_observed",
        verificationState: "verified_basic",
        usdInEst: "300.75",
      });
    });

    it("counts only the bridge deposit leg", async () => {
      expect(await leaderboardResponse()).toEqual([
        {
          alias: aliasOf(5),
          name: null,
          volumeUsd: "300.75",
          txCount: 1,
          protocolCount: 1,
          chainCount: 1,
          lastSeenSeconds: expect.any(Number),
        },
      ]);
    });
  });

  describe("after a purge sweep of a revoked agent", () => {
    beforeAll(async () => {
      await resetData(db.pool);
      await seedAgent(db.pool, hashOf(6));
      await seedActivity(db.pool, { agentHash: hashOf(6), usdInEst: "60" });
      await seedAgent(db.pool, hashOf(7), 25);
      await seedActivity(db.pool, { agentHash: hashOf(7), usdInEst: "80" });
    });

    it("drops the purged agent's alias from the response", async () => {
      expect(await leaderboardResponse()).toEqual([
        {
          alias: aliasOf(7),
          name: null,
          volumeUsd: "80",
          txCount: 1,
          protocolCount: 1,
          chainCount: 1,
          lastSeenSeconds: expect.any(Number),
        },
        {
          alias: aliasOf(6),
          name: null,
          volumeUsd: "60",
          txCount: 1,
          protocolCount: 1,
          chainCount: 1,
          lastSeenSeconds: expect.any(Number),
        },
      ]);

      await runPurgeSweep(db.pool, config);

      expect(await leaderboardResponse()).toEqual([
        {
          alias: aliasOf(6),
          name: null,
          volumeUsd: "60",
          txCount: 1,
          protocolCount: 1,
          chainCount: 1,
          lastSeenSeconds: expect.any(Number),
        },
      ]);
    });
  });

  describe("with one bound agent and one unbound agent", () => {
    beforeAll(async () => {
      await resetData(db.pool);
      await seedAgent(db.pool, hashOf(9));
      await db.pool.query("UPDATE agents SET name = 'Vex-09090909' WHERE agent_hash = $1", [
        hashOf(9),
      ]);
      await seedActivity(db.pool, { agentHash: hashOf(9), usdInEst: "200" });
      await seedAgent(db.pool, hashOf(10));
      await seedActivity(db.pool, { agentHash: hashOf(10), usdInEst: "100" });
    });

    it("links the bound agent by name and leaves the unbound one linkless", async () => {
      expect(await leaderboardResponse()).toEqual([
        {
          alias: aliasOf(9),
          name: "Vex-09090909",
          volumeUsd: "200",
          txCount: 1,
          protocolCount: 1,
          chainCount: 1,
          lastSeenSeconds: expect.any(Number),
        },
        {
          alias: aliasOf(10),
          name: null,
          volumeUsd: "100",
          txCount: 1,
          protocolCount: 1,
          chainCount: 1,
          lastSeenSeconds: expect.any(Number),
        },
      ]);
    });
  });
});

describe("GET /api/agents with the response cache enabled", () => {
  let cachedApp: FastifyInstance;

  beforeAll(async () => {
    const cachedConfig = loadConfig({
      DATABASE_URL: "postgres://unused-in-tests",
      READ_CACHE_TTL_SEC: "300",
    });
    cachedApp = await buildApp({
      pool: db.pool,
      config: cachedConfig,
      resolveChain: stubResolveChain,
    });
    await resetData(db.pool);
  });

  afterAll(async () => {
    await cachedApp.close();
  });

  it("serves the first result for the whole window and labels it cacheable", async () => {
    const first = await cachedApp.inject({ method: "GET", url: "/api/agents" });
    expect(first.json<AgentStatDto[]>()).toEqual([]);
    expect(first.headers["cache-control"]).toBe("public, s-maxage=300");

    await seedAgent(db.pool, hashOf(8));
    await seedActivity(db.pool, { agentHash: hashOf(8), usdInEst: "90" });

    const second = await cachedApp.inject({ method: "GET", url: "/api/agents" });
    expect(second.json<AgentStatDto[]>()).toEqual([]);
  });
});
