import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resolveChain } from "@agentscan/core";
import { buildApp } from "../../app.js";
import { loadConfig } from "../../config.js";
import type { AgentPageDto } from "../../agent-page-dto.js";
import { startTestDb } from "../../testing/pg-harness.js";

const config = loadConfig({ DATABASE_URL: "postgres://unused-in-tests", READ_CACHE_TTL_SEC: "0" });

const BOUND_AGENT = "a".repeat(64);
const BOUND_NAME = "Vex-aaaaaaaa";
const REVOKED_AGENT = "b".repeat(64);
const REVOKED_NAME = "Vex-bbbbbbbb";
const QUARANTINED_AGENT = "c".repeat(64);
const QUARANTINED_NAME = "Vex-cccccccc";
const UNBOUND_AGENT = "d".repeat(64);
const SILENT_AGENT = "e".repeat(64);
const SILENT_NAME = "Vex-eeeeeeee";

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const BASE_CHAIN_ID = 8453n;
const ARBITRUM_CHAIN_ID = 42161n;

let db: Awaited<ReturnType<typeof startTestDb>>;
let app: FastifyInstance;
let seedCounter = 0;

type AgentSeed = { agentHash: string; name: string | null; status?: string };

async function seedAgent(pool: pg.Pool, seed: AgentSeed): Promise<void> {
  await pool.query(
    `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, status, name)
     VALUES ($1, 'token-sha', 1, now(), $2, $3)`,
    [seed.agentHash, seed.status ?? "active", seed.name],
  );
}

type ActivitySeed = {
  agentHash: string;
  daysAgo: number;
  protocol?: string;
  chainId?: bigint;
  kind?: string;
  eventRole?: string;
  verificationState?: string;
  pricingState?: string;
  usdInPriced?: string | null;
  usdOutPriced?: string | null;
  tokenInAddress?: string | null;
  tokenInDecimals?: number | null;
  executedInRaw?: string | null;
  tokenOutAddress?: string | null;
  tokenOutDecimals?: number | null;
  executedOutRaw?: string | null;
  txHash?: string | null;
  clientConfirmed?: boolean;
  blockTimeDaysAgo?: number;
  verifiedAtDaysAgo?: number;
};

async function seedActivity(pool: pg.Pool, seed: ActivitySeed): Promise<void> {
  seedCounter += 1;
  const rowKey = `agent-page-seed-${seedCounter}`;
  await pool.query(
    `INSERT INTO activities
       (agent_hash, source_row_id, public_id, source_execution_id, event_index, kind, event_role, status,
        protocol, chain_family, chain_id,
        token_in_address, token_in_decimals, executed_in_raw,
        token_out_address, token_out_decimals, executed_out_raw,
        usd_in_priced, usd_out_priced, pricing_state,
        tx_hash, client_created_at, client_confirmed_at, block_time, verified_at,
        statuses_seen, verification_state, received_schema_version)
     VALUES ($1, $2, $2, $2, 0, $3, $4, 'confirmed',
             $5, 'eip155', $6::bigint,
             $7, $8, $9,
             $10, $11, $12,
             $13::numeric, $14::numeric, $15,
             $16,
             now() - make_interval(days => $17) - interval '1 hour',
             CASE WHEN $19::boolean THEN now() - make_interval(days => $17) END,
             CASE WHEN $20::int IS NOT NULL THEN now() - make_interval(days => $20::int) END,
             CASE WHEN $21::int IS NOT NULL THEN now() - make_interval(days => $21::int) END,
             ARRAY['confirmed'], $18, 1)`,
    [
      seed.agentHash,
      rowKey,
      seed.kind ?? "swap",
      seed.eventRole ?? "swap",
      seed.protocol ?? "kyberswap",
      (seed.chainId ?? BASE_CHAIN_ID).toString(),
      seed.tokenInAddress === undefined ? USDC : seed.tokenInAddress,
      seed.tokenInDecimals === undefined ? 6 : seed.tokenInDecimals,
      seed.executedInRaw === undefined ? "1000000000" : seed.executedInRaw,
      seed.tokenOutAddress === undefined ? WETH : seed.tokenOutAddress,
      seed.tokenOutDecimals === undefined ? 18 : seed.tokenOutDecimals,
      seed.executedOutRaw === undefined ? "1000000000000000000" : seed.executedOutRaw,
      seed.usdInPriced === undefined ? "1000" : seed.usdInPriced,
      seed.usdOutPriced === undefined ? "1000" : seed.usdOutPriced,
      seed.pricingState ?? "server_priced",
      seed.txHash === undefined ? `0x${"ab".repeat(32)}` : seed.txHash,
      seed.daysAgo,
      seed.verificationState ?? "verified_full",
      seed.clientConfirmed ?? true,
      seed.blockTimeDaysAgo ?? null,
      seed.verifiedAtDaysAgo ?? null,
    ],
  );
}

async function resetData(pool: pg.Pool): Promise<void> {
  await pool.query("TRUNCATE agents CASCADE");
}

async function agentPage(name: string) {
  return app.inject({ method: "GET", url: `/api/agents/${encodeURIComponent(name)}` });
}

beforeAll(async () => {
  db = await startTestDb();
  app = await buildApp({ pool: db.pool, config, resolveChain });
});

afterAll(async () => {
  await app.close();
  await db.stop();
});

describe("GET /api/agents/:name returning 404", () => {
  beforeAll(async () => {
    await resetData(db.pool);
    await seedAgent(db.pool, { agentHash: BOUND_AGENT, name: BOUND_NAME });
    await seedActivity(db.pool, { agentHash: BOUND_AGENT, daysAgo: 1 });
    await seedAgent(db.pool, { agentHash: REVOKED_AGENT, name: REVOKED_NAME, status: "revoked" });
    await seedActivity(db.pool, { agentHash: REVOKED_AGENT, daysAgo: 1 });
    await seedAgent(db.pool, {
      agentHash: QUARANTINED_AGENT,
      name: QUARANTINED_NAME,
      status: "quarantined",
    });
    await seedActivity(db.pool, { agentHash: QUARANTINED_AGENT, daysAgo: 1 });
    await seedAgent(db.pool, { agentHash: UNBOUND_AGENT, name: null });
    await seedActivity(db.pool, { agentHash: UNBOUND_AGENT, daysAgo: 1 });
    await seedAgent(db.pool, { agentHash: SILENT_AGENT, name: SILENT_NAME });
    await seedActivity(db.pool, {
      agentHash: SILENT_AGENT,
      daysAgo: 1,
      verificationState: "queued",
    });
  });

  const missing: Array<[string, string]> = [
    ["a revoked agent", REVOKED_NAME],
    ["a quarantined agent", QUARANTINED_NAME],
    ["an agent with no verified activity", SILENT_NAME],
    ["a name that differs only in case", BOUND_NAME.toLowerCase()],
    ["an unknown name", "Vex-99999999"],
    ["the alias of an unbound agent", "agent-deadbeef"],
  ];

  it.each(missing)("serves the standard error envelope for %s", async (_case, name) => {
    const response = await agentPage(name);
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { code: "not_found", message: "agent not found" } });
  });

  it("never long-caches a miss, so a newly bound agent appears promptly", async () => {
    const response = await agentPage("Vex-99999999");
    expect(response.headers["cache-control"]).toBe(undefined);
  });

  it("serves the bound agent that the same fixture set contains", async () => {
    const response = await agentPage(BOUND_NAME);
    expect(response.statusCode).toBe(200);
    expect(response.json<AgentPageDto>().name).toBe(BOUND_NAME);
  });
});

describe("GET /api/agents/:name with the gate cached", () => {
  const cachedConfig = loadConfig({
    DATABASE_URL: "postgres://unused-in-tests",
    READ_CACHE_TTL_SEC: "300",
  });
  let cachedApp: FastifyInstance;

  beforeAll(async () => {
    await resetData(db.pool);
    cachedApp = await buildApp({ pool: db.pool, config: cachedConfig, resolveChain });
  });

  afterAll(async () => {
    await cachedApp.close();
  });

  it("never caches a miss, so an agent bound after the first look appears at once", async () => {
    const before = await cachedApp.inject({ method: "GET", url: `/api/agents/${BOUND_NAME}` });
    expect(before.statusCode).toBe(404);

    await seedAgent(db.pool, { agentHash: BOUND_AGENT, name: BOUND_NAME });
    await seedActivity(db.pool, { agentHash: BOUND_AGENT, daysAgo: 1 });

    const after = await cachedApp.inject({ method: "GET", url: `/api/agents/${BOUND_NAME}` });
    expect(after.statusCode).toBe(200);
  });

  it("holds a hit for the read cache window, so revocation lands within it and not sooner", async () => {
    await db.pool.query("UPDATE agents SET status = 'revoked' WHERE agent_hash = $1", [BOUND_AGENT]);

    const cached = await cachedApp.inject({ method: "GET", url: `/api/agents/${BOUND_NAME}` });
    expect(cached.statusCode).toBe(200);

    const uncached = await agentPage(BOUND_NAME);
    expect(uncached.statusCode).toBe(404);
  });
});

describe("GET /api/agents/:name over two protocols and two chains", () => {
  beforeAll(async () => {
    await resetData(db.pool);
    await seedAgent(db.pool, { agentHash: BOUND_AGENT, name: BOUND_NAME });
    await seedActivity(db.pool, {
      agentHash: BOUND_AGENT,
      daysAgo: 3,
      protocol: "kyberswap",
      chainId: BASE_CHAIN_ID,
      tokenInAddress: USDC,
      tokenInDecimals: 6,
      executedInRaw: "1000000000",
      usdInPriced: "1000",
      tokenOutAddress: WETH,
      tokenOutDecimals: 18,
      executedOutRaw: "1000000000000000000",
      usdOutPriced: "1000",
    });
    await seedActivity(db.pool, {
      agentHash: BOUND_AGENT,
      daysAgo: 2,
      protocol: "kyberswap",
      chainId: BASE_CHAIN_ID,
      tokenInAddress: WETH,
      tokenInDecimals: 18,
      executedInRaw: "1000000000000000000",
      usdInPriced: "1250",
      tokenOutAddress: USDC,
      tokenOutDecimals: 6,
      executedOutRaw: "1250000000",
      usdOutPriced: "1250",
    });
    await seedActivity(db.pool, {
      agentHash: BOUND_AGENT,
      daysAgo: 1,
      protocol: "relay",
      chainId: ARBITRUM_CHAIN_ID,
      kind: "bridge",
      eventRole: "bridge_deposit",
      tokenInAddress: USDC,
      tokenInDecimals: 6,
      executedInRaw: "500000000",
      usdInPriced: "500",
      tokenOutAddress: USDC,
      tokenOutDecimals: 6,
      executedOutRaw: "499000000",
      usdOutPriced: "499",
    });
    await seedActivity(db.pool, {
      agentHash: BOUND_AGENT,
      daysAgo: 1,
      protocol: "relay",
      chainId: ARBITRUM_CHAIN_ID,
      pricingState: "unpriced",
      usdInPriced: null,
      usdOutPriced: null,
    });
  });

  it("reports every figure over the seeded rows", async () => {
    const response = await agentPage(BOUND_NAME);
    expect(response.statusCode).toBe(200);
    const page = response.json<AgentPageDto>();

    expect(page.name).toBe(BOUND_NAME);
    expect(page.capitalDeployedPeak30dUsd).toBe("1250");
    expect(page.dailyDeployedUsd).toHaveLength(30);
    expect(page.dailyDeployedUsd.filter((point) => point.usd !== "0").map((point) => point.usd)).toEqual([
      "1000",
      "1250",
      "500",
    ]);
    expect(page.realizedResultUsd).toBe("250");
    expect(page.closedRoundTrips).toBe(1);
    expect(page.unmatchedDisposals).toBe(1);
    expect(page.winRate).toBe(null);
    expect(page.protocolBreakdown).toEqual([
      { protocol: "kyberswap", volumeUsd: "2250", txCount: 2 },
      { protocol: "relay", volumeUsd: "500", txCount: 2 },
    ]);
    expect(page.chainBreakdown).toEqual([
      { chainSlug: "base", volumeUsd: "2250", txCount: 2 },
      { chainSlug: "arbitrum", volumeUsd: "500", txCount: 2 },
    ]);
    expect(page.activityCount).toBe(4);
    expect(page.activitiesPerDay30d).toBe(0.13);
    expect(page.unpricedSharePct).toBe(25);
    expect(page.unpriced30dSharePct).toBe(25);
    expect(page.truncated).toBe(false);
    expect(page.firstSeenSeconds).toBe(3 * 86_400);
    expect(page.lastSeenSeconds).toBe(86_400);
  });

  it("labels a hit as cacheable for the read cache window", async () => {
    const response = await agentPage(BOUND_NAME);
    expect(response.headers["cache-control"]).toBe("public, s-maxage=0");
  });

  it("carries a real transaction hash on the rows the page is built from", async () => {
    const stored = await db.pool.query<{ tx_hash: string }>(
      "SELECT tx_hash FROM activities WHERE agent_hash = $1 AND tx_hash IS NOT NULL LIMIT 1",
      [BOUND_AGENT],
    );
    expect(stored.rows[0]?.tx_hash).toBe(`0x${"ab".repeat(32)}`);
  });

  it("publishes aggregates only, never a transaction or an address", async () => {
    const response = await agentPage(BOUND_NAME);
    const payload = response.payload;

    expect(payload).not.toContain("txHash");
    expect(payload).not.toContain("agentHash");
    expect(payload).not.toContain("lastHandshakeAt");
    expect(payload).not.toMatch(/0x[0-9a-fA-F]{40}/);
    expect(payload).not.toMatch(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
    expect(payload).not.toContain(BOUND_AGENT);
    expect(payload).not.toContain("ab".repeat(32));
    expect(payload).not.toContain(USDC);
    expect(payload).not.toContain(WETH);
  });
});

describe("GET /api/agents/:name past the row cap", () => {
  const cappedConfig = loadConfig({
    DATABASE_URL: "postgres://unused-in-tests",
    READ_CACHE_TTL_SEC: "0",
    PUBLIC_AGENT_ROWS_MAX: "3",
  });
  let cappedApp: FastifyInstance;

  beforeAll(async () => {
    await resetData(db.pool);
    cappedApp = await buildApp({ pool: db.pool, config: cappedConfig, resolveChain });
    await seedAgent(db.pool, { agentHash: BOUND_AGENT, name: BOUND_NAME });
    for (const daysAgo of [5, 4, 3, 2, 1]) {
      await seedActivity(db.pool, { agentHash: BOUND_AGENT, daysAgo, usdInPriced: "100" });
    }
  });

  afterAll(async () => {
    await cappedApp.close();
  });

  it("computes over the capped set and says the history was truncated", async () => {
    const response = await cappedApp.inject({ method: "GET", url: `/api/agents/${BOUND_NAME}` });
    expect(response.statusCode).toBe(200);
    const page = response.json<AgentPageDto>();

    expect(page.truncated).toBe(true);
    expect(page.activityCount).toBe(3);
    expect(page.capitalDeployedPeak30dUsd).toBe("100");
    expect(page.dailyDeployedUsd.filter((point) => point.usd !== "0")).toHaveLength(3);
  });

  it("dates first seen from the agent's whole history, not from the capped read", async () => {
    const response = await cappedApp.inject({ method: "GET", url: `/api/agents/${BOUND_NAME}` });
    const page = response.json<AgentPageDto>();

    expect(page.firstSeenSeconds).toBe(5 * 86_400);
    expect(page.lastSeenSeconds).toBe(86_400);
  });
});

describe("GET /api/agents/:name win rate at the floor", () => {
  beforeEach(async () => {
    await resetData(db.pool);
    await seedAgent(db.pool, { agentHash: BOUND_AGENT, name: BOUND_NAME });
  });

  const tokenAt = (index: number) => `0x${index.toString(16).padStart(40, "0")}`;

  async function seedRoundTrips(count: number): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      await seedActivity(db.pool, {
        agentHash: BOUND_AGENT,
        daysAgo: 20 - index * 2,
        tokenInAddress: tokenAt(100 + index),
        tokenInDecimals: 18,
        executedInRaw: "1000000000000000000",
        usdInPriced: "1000",
        tokenOutAddress: tokenAt(200 + index),
        tokenOutDecimals: 18,
        executedOutRaw: "1000000000000000000",
        usdOutPriced: "1000",
      });
      await seedActivity(db.pool, {
        agentHash: BOUND_AGENT,
        daysAgo: 19 - index * 2,
        tokenInAddress: tokenAt(200 + index),
        tokenInDecimals: 18,
        executedInRaw: "1000000000000000000",
        usdInPriced: "1100",
        tokenOutAddress: tokenAt(300 + index),
        tokenOutDecimals: 18,
        executedOutRaw: "1100000000000000000",
        usdOutPriced: "1100",
      });
    }
  }

  it("withholds the rate below the configured floor", async () => {
    await seedRoundTrips(4);
    const page = (await agentPage(BOUND_NAME)).json<AgentPageDto>();
    expect(page.closedRoundTrips).toBe(4);
    expect(page.winRate).toBe(null);
  });

  it("reports the rate at exactly the configured floor", async () => {
    await seedRoundTrips(5);
    const page = (await agentPage(BOUND_NAME)).json<AgentPageDto>();
    expect(page.closedRoundTrips).toBe(5);
    expect(page.winRate).toBe(1);
  });
});

describe("GET /api/agents/:name when a priced row has a leg the lane could not value", () => {
  beforeAll(async () => {
    await resetData(db.pool);
    await seedAgent(db.pool, { agentHash: BOUND_AGENT, name: BOUND_NAME });
    await seedActivity(db.pool, {
      agentHash: BOUND_AGENT,
      daysAgo: 1,
      usdInPriced: "100",
      usdOutPriced: null,
    });
  });

  it("counts the row as unpriced while still publishing the dollars it did price", async () => {
    const page = (await agentPage(BOUND_NAME)).json<AgentPageDto>();

    expect(page.unpricedSharePct).toBe(100);
    expect(page.unpriced30dSharePct).toBe(100);
    expect(page.capitalDeployedPeak30dUsd).toBe("100");
    expect(page.protocolBreakdown).toEqual([
      { protocol: "kyberswap", volumeUsd: "100", txCount: 1 },
    ]);
    expect(page.chainBreakdown).toEqual([{ chainSlug: "base", volumeUsd: "100", txCount: 1 }]);
  });
});

describe("GET /api/agents/:name mixing a fully priced row with a partly priced one", () => {
  beforeAll(async () => {
    await resetData(db.pool);
    await seedAgent(db.pool, { agentHash: BOUND_AGENT, name: BOUND_NAME });
    await seedActivity(db.pool, {
      agentHash: BOUND_AGENT,
      daysAgo: 1,
      usdInPriced: "1000",
      usdOutPriced: "990",
    });
    await seedActivity(db.pool, {
      agentHash: BOUND_AGENT,
      daysAgo: 1,
      usdInPriced: "2000",
      usdOutPriced: null,
    });
  });

  it("publishes a volume two thirds of which comes from the row the share calls unpriced", async () => {
    const page = (await agentPage(BOUND_NAME)).json<AgentPageDto>();

    expect(page.unpricedSharePct).toBe(50);
    expect(page.unpriced30dSharePct).toBe(50);
    expect(page.capitalDeployedPeak30dUsd).toBe("3000");
    expect(page.protocolBreakdown).toEqual([
      { protocol: "kyberswap", volumeUsd: "3000", txCount: 2 },
    ]);
  });
});

describe("GET /api/agents/:name when a row is still being priced", () => {
  beforeAll(async () => {
    await resetData(db.pool);
    await seedAgent(db.pool, { agentHash: BOUND_AGENT, name: BOUND_NAME });
    await seedActivity(db.pool, {
      agentHash: BOUND_AGENT,
      daysAgo: 1,
      usdInPriced: "1000",
      usdOutPriced: "990",
    });
    await seedActivity(db.pool, {
      agentHash: BOUND_AGENT,
      daysAgo: 1,
      pricingState: "pending",
      usdInPriced: null,
      usdOutPriced: null,
    });
  });

  it("counts the pending row apart from a share that stays a verdict about settled rows", async () => {
    const page = (await agentPage(BOUND_NAME)).json<AgentPageDto>();

    expect(page.awaitingAPriceCount).toBe(1);
    expect(page.unpricedSharePct).toBe(0);
    expect(page.unpriced30dSharePct).toBe(0);
    expect(page.capitalDeployedPeak30dUsd).toBe("1000");
    expect(page.protocolBreakdown).toEqual([
      { protocol: "kyberswap", volumeUsd: "1000", txCount: 2 },
    ]);
    expect(page.activityCount).toBe(2);
  });
});

describe("GET /api/agents/:name when nothing has been priced yet", () => {
  beforeAll(async () => {
    await resetData(db.pool);
    await seedAgent(db.pool, { agentHash: BOUND_AGENT, name: BOUND_NAME });
    await seedActivity(db.pool, {
      agentHash: BOUND_AGENT,
      daysAgo: 1,
      pricingState: "pending",
      usdInPriced: null,
      usdOutPriced: null,
    });
  });

  it("reports the whole read set as awaiting a price rather than as a settled zero", async () => {
    const page = (await agentPage(BOUND_NAME)).json<AgentPageDto>();

    expect(page.awaitingAPriceCount).toBe(1);
    expect(page.unpricedSharePct).toBe(0);
    expect(page.capitalDeployedPeak30dUsd).toBe("0");
    expect(page.activityCount).toBe(1);
  });
});

describe("GET /api/agents/:name when the client sent no confirmation time", () => {
  beforeAll(async () => {
    await resetData(db.pool);
    await seedAgent(db.pool, { agentHash: BOUND_AGENT, name: BOUND_NAME });
    await seedActivity(db.pool, {
      agentHash: BOUND_AGENT,
      daysAgo: 10,
      clientConfirmed: false,
      blockTimeDaysAgo: 10,
      verifiedAtDaysAgo: 3,
      tokenInAddress: USDC,
      tokenInDecimals: 6,
      executedInRaw: "1000000000",
      usdInPriced: "1000",
      tokenOutAddress: WETH,
      tokenOutDecimals: 18,
      executedOutRaw: "1000000000000000000",
      usdOutPriced: "1000",
    });
    await seedActivity(db.pool, {
      agentHash: BOUND_AGENT,
      daysAgo: 8,
      clientConfirmed: false,
      blockTimeDaysAgo: 8,
      verifiedAtDaysAgo: 5,
      tokenInAddress: WETH,
      tokenInDecimals: 18,
      executedInRaw: "1000000000000000000",
      usdInPriced: "1200",
      tokenOutAddress: USDC,
      tokenOutDecimals: 6,
      executedOutRaw: "1200000000",
      usdOutPriced: "1200",
    });
  });

  it("dates activity from the block it settled in, not from when the server verified it", async () => {
    const page = (await agentPage(BOUND_NAME)).json<AgentPageDto>();

    expect(page.firstSeenSeconds).toBe(10 * 86_400);
    expect(page.lastSeenSeconds).toBe(8 * 86_400);
  });

  it("orders the FIFO queue by block time, so the acquisition precedes its disposal", async () => {
    const page = (await agentPage(BOUND_NAME)).json<AgentPageDto>();

    expect(page.realizedResultUsd).toBe("200");
    expect(page.closedRoundTrips).toBe(1);
    expect(page.unmatchedDisposals).toBe(1);
  });

  it("places each day's deployed capital on the day the block settled", async () => {
    const page = (await agentPage(BOUND_NAME)).json<AgentPageDto>();

    expect(page.dailyDeployedUsd.filter((point) => point.usd !== "0")).toEqual([
      { day: page.dailyDeployedUsd[19]?.day ?? "", usd: "1000" },
      { day: page.dailyDeployedUsd[21]?.day ?? "", usd: "1200" },
    ]);
  });
});

describe("GET /api/agents/:name for a row verified before block time was recorded", () => {
  beforeAll(async () => {
    await resetData(db.pool);
    await seedAgent(db.pool, { agentHash: BOUND_AGENT, name: BOUND_NAME });
    await seedActivity(db.pool, {
      agentHash: BOUND_AGENT,
      daysAgo: 4,
      clientConfirmed: false,
      verifiedAtDaysAgo: 4,
    });
  });

  it("falls back to the verification time rather than losing the row's date", async () => {
    const page = (await agentPage(BOUND_NAME)).json<AgentPageDto>();

    expect(page.firstSeenSeconds).toBe(4 * 86_400);
    expect(page.lastSeenSeconds).toBe(4 * 86_400);
    expect(page.activityCount).toBe(1);
  });
});

describe("GET /api/agents/:name resolution of published figures", () => {
  beforeAll(async () => {
    await resetData(db.pool);
    await seedAgent(db.pool, { agentHash: BOUND_AGENT, name: BOUND_NAME });
    await seedActivity(db.pool, {
      agentHash: BOUND_AGENT,
      daysAgo: 2,
      usdInPriced: "1013.478912345678901234",
      usdOutPriced: "1009.111111111111111111",
    });
    await seedActivity(db.pool, {
      agentHash: BOUND_AGENT,
      daysAgo: 1,
      usdInPriced: "0.004999999999999999",
      usdOutPriced: "0.004999999999999999",
    });
  });

  it("stores the sub-cent figures the page is built from", async () => {
    const stored = await db.pool.query<{ usd_in_priced: string }>(
      "SELECT usd_in_priced::text FROM activities WHERE agent_hash = $1 ORDER BY id LIMIT 1",
      [BOUND_AGENT],
    );
    expect(stored.rows[0]?.usd_in_priced).toBe("1013.478912345678901234");
  });

  it("rounds every published USD figure to cents", async () => {
    const page = (await agentPage(BOUND_NAME)).json<AgentPageDto>();
    const published = [
      page.capitalDeployedPeak30dUsd,
      page.realizedResultUsd,
      ...page.dailyDeployedUsd.map((point) => point.usd),
      ...page.protocolBreakdown.map((entry) => entry.volumeUsd),
      ...page.chainBreakdown.map((entry) => entry.volumeUsd),
    ];

    for (const value of published) expect(value).toMatch(/^-?\d+(\.\d{1,2})?$/);
    expect(page.capitalDeployedPeak30dUsd).toBe("1013.48");
    expect(page.protocolBreakdown).toEqual([
      { protocol: "kyberswap", volumeUsd: "1013.48", txCount: 2 },
    ]);
    expect(page.dailyDeployedUsd.filter((point) => point.usd !== "0").map((point) => point.usd)).toEqual([
      "1013.48",
    ]);
    expect(page.dailyDeployedUsd[28]?.usd).toBe("0");
  });

  it("coarsens both seen ages to whole hours", async () => {
    const page = (await agentPage(BOUND_NAME)).json<AgentPageDto>();

    expect(page.firstSeenSeconds % 3600).toBe(0);
    expect(page.lastSeenSeconds % 3600).toBe(0);
    expect(page.firstSeenSeconds).toBe(2 * 86_400);
    expect(page.lastSeenSeconds).toBe(86_400);
  });
});
