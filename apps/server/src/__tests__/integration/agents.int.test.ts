import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type ResolveChain } from "../../app.js";
import { loadConfig } from "../../config.js";
import { agentAlias, type AgentStatDto } from "../../public-dto.js";
import { startTestDb } from "../../testing/pg-harness.js";
import { runPurgeSweep } from "../../worker/purge.js";

const PAGE_SIZE = 2;
const config = loadConfig({
  DATABASE_URL: "postgres://unused-in-tests",
  READ_CACHE_TTL_SEC: "0",
  PUBLIC_AGENT_PAGE_SIZE: String(PAGE_SIZE),
});
const stubResolveChain: ResolveChain = () => null;

type AgentLeaderboardDto = {
  items: AgentStatDto[];
  nextCursor: string | null;
  totalAllTime: number;
  totalInWindow: number;
};

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
  usdInPriced: string | null;
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
        protocol, chain_family, chain_id, usd_in_priced, pricing_state, tx_hash,
        client_created_at, client_confirmed_at, statuses_seen, verification_state, received_schema_version)
     VALUES ($1, $2, $2, $2, 0, $3, $4, $5,
             'kyberswap', 'eip155', 8453, $6, 'server_priced', $7,
             now() - make_interval(days => $8) - interval '1 hour',
             CASE WHEN $5 = 'pending' THEN NULL ELSE now() - make_interval(days => $8) END,
             ARRAY['pending'], $9, 1)`,
    [
      seed.agentHash,
      rowKey,
      eventRole === "swap" ? "swap" : "bridge",
      eventRole,
      status,
      seed.usdInPriced,
      status === "pending" ? null : `0x${rowKey}`,
      seed.confirmedDaysAgo ?? 0,
      seed.verificationState ?? "verified_full",
    ],
  );
}

async function resetData(pool: pg.Pool): Promise<void> {
  await pool.query("TRUNCATE agents CASCADE");
}

function leaderboardRow(
  index: number,
  volumeUsd: string,
  extra: Partial<AgentStatDto> = {},
): AgentStatDto {
  return {
    alias: aliasOf(index),
    name: null,
    volumeUsd,
    txCount: 1,
    protocolCount: 1,
    chainCount: 1,
    lastSeenSeconds: expect.any(Number),
    ...extra,
  };
}

async function leaderboardPage(url = "/api/agents"): Promise<AgentLeaderboardDto> {
  const response = await app.inject({ method: "GET", url });
  expect(response.statusCode).toBe(200);
  return response.json<AgentLeaderboardDto>();
}

async function leaderboardItems(url = "/api/agents"): Promise<AgentStatDto[]> {
  return (await leaderboardPage(url)).items;
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
    expect(await leaderboardPage()).toEqual({
      items: [],
      nextCursor: null,
      totalAllTime: 0,
      totalInWindow: 0,
    });
  });

  it("rejects a malformed cursor", async () => {
    const response = await app.inject({ method: "GET", url: "/api/agents?cursor=not-a-cursor" });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { code: "invalid_cursor", message: "malformed cursor" } });
  });

  describe("with eleven agents of descending volume", () => {
    beforeAll(async () => {
      await resetData(db.pool);
      for (let index = 0; index <= 10; index += 1) {
        await seedAgent(db.pool, hashOf(index));
        await seedActivity(db.pool, { agentHash: hashOf(index), usdInPriced: String(1100 - index * 100) });
      }
    });

    it("serves the first page by volume and leaves a cursor for the rest", async () => {
      const page = await leaderboardPage();
      expect(page.items).toEqual([leaderboardRow(0, "1100"), leaderboardRow(1, "1000")]);
      expect(page.nextCursor).not.toBeNull();
      expect(page.totalAllTime).toBe(11);
      expect(page.totalInWindow).toBe(11);
    });

    it("continues from the cursor without repeating a row", async () => {
      const first = await leaderboardPage();
      const second = await leaderboardPage(`/api/agents?cursor=${first.nextCursor}`);
      expect(second.items).toEqual([leaderboardRow(2, "900"), leaderboardRow(3, "800")]);
      expect(second.items.map((row) => row.alias)).not.toEqual(
        expect.arrayContaining(first.items.map((row) => row.alias)),
      );
    });

    it("walks every agent exactly once", async () => {
      const seen: string[] = [];
      let cursor: string | null = null;
      for (let step = 0; step < 20; step += 1) {
        const url = cursor === null ? "/api/agents" : `/api/agents?cursor=${cursor}`;
        const page = await leaderboardPage(url);
        seen.push(...page.items.map((row) => row.alias));
        if (page.nextCursor === null) break;
        cursor = page.nextCursor;
      }
      expect(seen).toEqual(Array.from({ length: 11 }, (_, index) => aliasOf(index)));
    });

    it("honours a smaller limit than the page size", async () => {
      const page = await leaderboardPage("/api/agents?limit=1");
      expect(page.items).toEqual([leaderboardRow(0, "1100")]);
      expect(page.nextCursor).not.toBeNull();
    });

    it("caps a limit above the page size", async () => {
      const page = await leaderboardPage("/api/agents?limit=99");
      expect(page.items).toHaveLength(PAGE_SIZE);
    });
  });

  describe("with activity older than the 30-day window", () => {
    beforeAll(async () => {
      await resetData(db.pool);
      await seedAgent(db.pool, hashOf(1));
      await seedActivity(db.pool, { agentHash: hashOf(1), usdInPriced: "100.25", confirmedDaysAgo: 1 });
      await seedActivity(db.pool, { agentHash: hashOf(1), usdInPriced: "500", confirmedDaysAgo: 31 });
      await seedAgent(db.pool, hashOf(2));
      await seedActivity(db.pool, { agentHash: hashOf(2), usdInPriced: "400", confirmedDaysAgo: 40 });
    });

    it("counts only rows confirmed within the last 30 days", async () => {
      const page = await leaderboardPage();
      expect(page.items).toEqual([leaderboardRow(1, "100.25")]);
      expect(page.nextCursor).toBeNull();
      expect(page.totalInWindow).toBe(1);
      expect(page.totalAllTime).toBe(2);
    });

    it("includes every verified volume agent on the all range", async () => {
      const page = await leaderboardPage("/api/agents?range=all");
      expect(page.items).toEqual([
        leaderboardRow(1, "600.25", { txCount: 2 }),
        leaderboardRow(2, "400"),
      ]);
      expect(page.totalAllTime).toBe(2);
      expect(page.totalInWindow).toBe(2);
    });
  });

  describe("with pending and mismatch rows", () => {
    beforeAll(async () => {
      await resetData(db.pool);
      await seedAgent(db.pool, hashOf(3));
      await seedActivity(db.pool, { agentHash: hashOf(3), usdInPriced: "50.5" });
      await seedActivity(db.pool, { agentHash: hashOf(3), status: "pending", verificationState: "none", usdInPriced: "70" });
      await seedActivity(db.pool, { agentHash: hashOf(3), verificationState: "mismatch", usdInPriced: "90" });
      await seedAgent(db.pool, hashOf(4));
      await seedActivity(db.pool, { agentHash: hashOf(4), status: "pending", verificationState: "none", usdInPriced: "80" });
      await seedActivity(db.pool, { agentHash: hashOf(4), verificationState: "mismatch", usdInPriced: "60" });
    });

    it("counts neither pending nor mismatch rows", async () => {
      expect(await leaderboardItems()).toEqual([leaderboardRow(3, "50.5")]);
    });
  });

  describe("with a verified bridge", () => {
    beforeAll(async () => {
      await resetData(db.pool);
      await seedAgent(db.pool, hashOf(5));
      await seedActivity(db.pool, { agentHash: hashOf(5), eventRole: "bridge_deposit", usdInPriced: "300.75" });
      await seedActivity(db.pool, {
        agentHash: hashOf(5),
        eventRole: "bridge_fill_observed",
        verificationState: "verified_basic",
        usdInPriced: "300.75",
      });
    });

    it("counts only the bridge deposit leg", async () => {
      expect(await leaderboardItems()).toEqual([leaderboardRow(5, "300.75")]);
    });
  });

  describe("after a purge sweep of a revoked agent", () => {
    beforeAll(async () => {
      await resetData(db.pool);
      await seedAgent(db.pool, hashOf(6));
      await seedActivity(db.pool, { agentHash: hashOf(6), usdInPriced: "60" });
      await seedAgent(db.pool, hashOf(7), 25);
      await seedActivity(db.pool, { agentHash: hashOf(7), usdInPriced: "80" });
    });

    it("drops the purged agent's alias from the response", async () => {
      expect(await leaderboardItems()).toEqual([leaderboardRow(7, "80"), leaderboardRow(6, "60")]);

      await runPurgeSweep(db.pool, config);

      expect(await leaderboardItems()).toEqual([leaderboardRow(6, "60")]);
    });
  });

  describe("with one bound agent and one unbound agent", () => {
    beforeAll(async () => {
      await resetData(db.pool);
      await seedAgent(db.pool, hashOf(9));
      await db.pool.query("UPDATE agents SET name = 'Vex-09090909' WHERE agent_hash = $1", [
        hashOf(9),
      ]);
      await seedActivity(db.pool, { agentHash: hashOf(9), usdInPriced: "200" });
      await seedAgent(db.pool, hashOf(10));
      await seedActivity(db.pool, { agentHash: hashOf(10), usdInPriced: "100" });
    });

    it("links the bound agent by name and leaves the unbound one linkless", async () => {
      expect(await leaderboardItems()).toEqual([
        leaderboardRow(9, "200", { name: "Vex-09090909" }),
        leaderboardRow(10, "100"),
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
    expect(first.json<AgentLeaderboardDto>()).toEqual({
      items: [],
      nextCursor: null,
      totalAllTime: 0,
      totalInWindow: 0,
    });
    expect(first.headers["cache-control"]).toBe("public, s-maxage=300");

    await seedAgent(db.pool, hashOf(8));
    await seedActivity(db.pool, { agentHash: hashOf(8), usdInPriced: "90" });

    const second = await cachedApp.inject({ method: "GET", url: "/api/agents" });
    expect(second.json<AgentLeaderboardDto>()).toEqual({
      items: [],
      nextCursor: null,
      totalAllTime: 0,
      totalInWindow: 0,
    });
  });
});
