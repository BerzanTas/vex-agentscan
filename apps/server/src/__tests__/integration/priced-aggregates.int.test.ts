import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveChain } from "@agentscan/core";
import { buildApp } from "../../app.js";
import { loadConfig } from "../../config.js";
import type {
  AgentStatDto,
  BridgeRouteDto,
  ChartPointDto,
  NetworkStatDto,
  PricingCoverageDto,
  ProtocolRankingDto,
  ProtocolStatDto,
  StatsDto,
  TokenStatDto,
} from "../../public-dto.js";
import { startTestDb } from "../../testing/pg-harness.js";

const agentHash = "7".repeat(64);
const usdcAddress = "0xaaa1";
const wethAddress = "0xbbb2";
const base = "8453";
const arbitrum = "42161";

type PricingState = "server_priced" | "unpriced" | "pending";

type ActivitySeed = {
  sourceRowId: string;
  protocol: string;
  kind: "swap" | "bridge";
  eventRole: "swap" | "bridge_deposit" | "bridge_fill_observed";
  pricingState: PricingState;
  usdInEst: string;
  usdOutEst: string | null;
  usdInPriced: string | null;
  usdOutPriced: string | null;
  tokenOutAddress: string | null;
  toChainId: string | null;
};

const CLIENT_ESTIMATE_NEVER_PUBLISHED = "999999.00";

const pricedSwap: ActivitySeed = {
  sourceRowId: "priced-swap",
  protocol: "kyberswap",
  kind: "swap",
  eventRole: "swap",
  pricingState: "server_priced",
  usdInEst: CLIENT_ESTIMATE_NEVER_PUBLISHED,
  usdOutEst: CLIENT_ESTIMATE_NEVER_PUBLISHED,
  usdInPriced: "100.00",
  usdOutPriced: "90.00",
  tokenOutAddress: wethAddress,
  toChainId: null,
};

const unpricedSwap: ActivitySeed = {
  ...pricedSwap,
  sourceRowId: "unpriced-swap",
  pricingState: "unpriced",
  usdInPriced: null,
  usdOutPriced: null,
};

const pendingSwap: ActivitySeed = {
  ...unpricedSwap,
  sourceRowId: "pending-swap",
  pricingState: "pending",
};

const stalePricedPendingSwap: ActivitySeed = {
  ...pricedSwap,
  sourceRowId: "stale-priced-pending-swap",
  pricingState: "pending",
  usdInPriced: "500.00",
  usdOutPriced: "450.00",
};

const pricedDeposit: ActivitySeed = {
  sourceRowId: "priced-deposit",
  protocol: "relay",
  kind: "bridge",
  eventRole: "bridge_deposit",
  pricingState: "server_priced",
  usdInEst: CLIENT_ESTIMATE_NEVER_PUBLISHED,
  usdOutEst: null,
  usdInPriced: "25.00",
  usdOutPriced: null,
  tokenOutAddress: null,
  toChainId: arbitrum,
};

const unpricedDeposit: ActivitySeed = {
  ...pricedDeposit,
  sourceRowId: "unpriced-deposit",
  pricingState: "unpriced",
  usdInPriced: null,
};

const MIXED_WINDOW: ActivitySeed[] = [
  pricedSwap,
  unpricedSwap,
  pendingSwap,
  stalePricedPendingSwap,
  pricedDeposit,
  unpricedDeposit,
];

const NOTHING_PRICED_WINDOW: ActivitySeed[] = [
  unpricedSwap,
  pendingSwap,
  stalePricedPendingSwap,
  unpricedDeposit,
];

const PRICED_VOLUME_USD = "125.00";
const PRICED_TOKEN_OUT_VOLUME_USD = "90.00";
const SEEDED_SWAP_COUNT = 4;
const SEEDED_DEPOSIT_COUNT = 2;
const SEEDED_ACTIVITY_COUNT = SEEDED_SWAP_COUNT + SEEDED_DEPOSIT_COUNT;

async function seedActivity(pool: pg.Pool, seed: ActivitySeed): Promise<void> {
  await pool.query(
    `INSERT INTO activities
       (agent_hash, source_row_id, public_id, source_execution_id, event_index, kind, event_role, status,
        protocol, chain_family, chain_id, from_chain_id, to_chain_id,
        token_in_address, token_in_symbol, token_in_decimals,
        token_out_address, token_out_symbol, token_out_decimals,
        usd_in_est, usd_out_est, usd_in_priced, usd_out_priced, pricing_state, priced_at,
        tx_hash, client_created_at, client_confirmed_at, statuses_seen,
        verification_state, verified_at, received_at, received_schema_version)
     VALUES ($1, $2, $2, $2, 0, $3, $4, 'confirmed',
             $5, 'eip155', $6::bigint, $7::bigint, $8::bigint,
             $9, 'USDC', 6,
             $10, 'WETH', 18,
             $11::numeric, $12::numeric, $13::numeric, $14::numeric, $15,
             CASE WHEN $15 = 'server_priced' THEN now() END,
             '0x' || $2, now(), now(), ARRAY['confirmed'],
             'verified_full', now(), now(), 1)`,
    [
      agentHash,
      seed.sourceRowId,
      seed.kind,
      seed.eventRole,
      seed.protocol,
      base,
      seed.toChainId === null ? null : base,
      seed.toChainId,
      usdcAddress,
      seed.tokenOutAddress,
      seed.usdInEst,
      seed.usdOutEst,
      seed.usdInPriced,
      seed.usdOutPriced,
      seed.pricingState,
    ],
  );
}

async function bookAggregatesForSeededActivities(pool: pg.Pool): Promise<void> {
  await pool.query(
    `INSERT INTO daily_aggregates (day, protocol, kind, volume_usd, tx_count, volume_usd_priced)
     SELECT (now() AT TIME ZONE 'utc')::date, protocol, kind, $1::numeric, COUNT(*)::int,
            COALESCE(SUM(usd_in_priced) FILTER (
              WHERE pricing_state = 'server_priced' AND event_role IN ('swap','bridge_deposit')
            ), 0)
     FROM activities
     GROUP BY protocol, kind
     ON CONFLICT (day, protocol, kind) DO UPDATE
       SET tx_count = EXCLUDED.tx_count,
           volume_usd_priced = EXCLUDED.volume_usd_priced`,
    [CLIENT_ESTIMATE_NEVER_PUBLISHED],
  );
}

async function seedWindow(pool: pg.Pool, seeds: readonly ActivitySeed[]): Promise<void> {
  await pool.query("TRUNCATE agents CASCADE");
  await pool.query("DELETE FROM daily_aggregates");
  await pool.query(
    `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, first_verified_at)
     VALUES ($1, 'token-sha', 1, now(), now())`,
    [agentHash],
  );
  for (const seed of seeds) await seedActivity(pool, seed);
  await bookAggregatesForSeededActivities(pool);
}

let db: Awaited<ReturnType<typeof startTestDb>>;
let app: FastifyInstance;

async function getJson<T>(url: string): Promise<T> {
  const response = await app.inject({ method: "GET", url });
  expect(response.statusCode).toBe(200);
  return response.json<T>();
}

function totalVolumeOf(points: readonly ChartPointDto[]): number {
  return points.reduce((total, point) => total + Number(point.volumeUsd), 0);
}

function totalTxOf(points: readonly ChartPointDto[]): number {
  return points.reduce((total, point) => total + point.txCount, 0);
}

function tokenRowOf(tokens: readonly TokenStatDto[], address: string): TokenStatDto {
  const row = tokens.find((token) => token.address === address);
  if (row === undefined) throw new Error(`token ${address} missing from the listing`);
  return row;
}

function networkRowOf(networks: readonly NetworkStatDto[], chainSlug: string): NetworkStatDto {
  const row = networks.find((network) => network.chainSlug === chainSlug);
  if (row === undefined) throw new Error(`network ${chainSlug} missing from the listing`);
  return row;
}

beforeAll(async () => {
  db = await startTestDb();
  const config = loadConfig({
    DATABASE_URL: "postgres://unused-in-tests",
    READ_CACHE_TTL_SEC: "0",
  });
  app = await buildApp({ pool: db.pool, config, resolveChain });
}, 120_000);

afterAll(async () => {
  await app.close();
  await db.stop();
});

describe("public aggregates over a window mixing priced, unpriced and pending rows", () => {
  beforeAll(async () => {
    await seedWindow(db.pool, MIXED_WINDOW);
  });

  it("totals only the server priced rows on /api/stats while counting all of them", async () => {
    const stats = await getJson<StatsDto>("/api/stats");

    expect(stats).toEqual({
      dailyVolumeUsd: PRICED_VOLUME_USD,
      totalVolumeUsd: PRICED_VOLUME_USD,
      dailyTx: SEEDED_ACTIVITY_COUNT,
      totalTx: SEEDED_ACTIVITY_COUNT,
      activeAgents7d: 1,
    });
  });

  it("ranks the agent on its priced volume and counts its unpriced activity", async () => {
    const agents = await getJson<AgentStatDto[]>("/api/agents");

    expect(agents.map((agent) => ({ volumeUsd: agent.volumeUsd, txCount: agent.txCount }))).toEqual([
      { volumeUsd: PRICED_VOLUME_USD, txCount: SEEDED_ACTIVITY_COUNT },
    ]);
  });

  it("buckets only priced volume on the live chart range and buckets every row into the counts", async () => {
    const points = await getJson<ChartPointDto[]>("/api/chart?range=24h");

    expect(totalVolumeOf(points)).toBe(Number(PRICED_VOLUME_USD));
    expect(totalTxOf(points)).toBe(SEEDED_ACTIVITY_COUNT);
  });

  it("buckets only priced volume on the daily chart range", async () => {
    const points = await getJson<ChartPointDto[]>("/api/chart?range=30d");

    expect(totalVolumeOf(points)).toBe(Number(PRICED_VOLUME_USD));
    expect(totalTxOf(points)).toBe(SEEDED_ACTIVITY_COUNT);
  });

  it("splits the priced volume across protocols and counts every row", async () => {
    const protocols = await getJson<ProtocolStatDto[]>("/api/protocols");

    expect(protocols).toEqual([
      { protocol: "kyberswap", volumeUsd: "100.00", txCount: SEEDED_SWAP_COUNT },
      { protocol: "relay", volumeUsd: "25.00", txCount: SEEDED_DEPOSIT_COUNT },
    ]);
  });

  it("ranks protocols on priced volume with unpriced rows in the transaction counts", async () => {
    const ranking = await getJson<ProtocolRankingDto[]>("/api/protocols/ranking?range=24h");

    expect(ranking.map(({ protocol, volumeUsd, txCount }) => ({ protocol, volumeUsd, txCount }))).toEqual([
      { protocol: "kyberswap", volumeUsd: "100.00", txCount: SEEDED_SWAP_COUNT },
      { protocol: "relay", volumeUsd: "25.00", txCount: SEEDED_DEPOSIT_COUNT },
    ]);
  });

  it("reports the network on priced volume with every row in its transaction count", async () => {
    const networks = await getJson<NetworkStatDto[]>("/api/networks?range=24h");
    const row = networkRowOf(networks, "base");

    expect({ volumeUsd: row.volumeUsd, txCount: row.txCount }).toEqual({
      volumeUsd: PRICED_VOLUME_USD,
      txCount: SEEDED_ACTIVITY_COUNT,
    });
  });

  it("sums each token leg from its own priced column and counts the unpriced legs", async () => {
    const tokens = await getJson<TokenStatDto[]>("/api/tokens?range=24h");

    expect(tokenRowOf(tokens, usdcAddress)).toMatchObject({
      volumeUsd: PRICED_VOLUME_USD,
      txCount: SEEDED_ACTIVITY_COUNT,
    });
    expect(tokenRowOf(tokens, wethAddress)).toMatchObject({
      volumeUsd: PRICED_TOKEN_OUT_VOLUME_USD,
      txCount: SEEDED_SWAP_COUNT,
    });
  });

  it("sums the bridge route on its priced deposit and counts both legs", async () => {
    const routes = await getJson<BridgeRouteDto[]>("/api/routes?range=24h");

    expect(routes).toEqual([
      {
        fromChainSlug: "base",
        toChainSlug: "arbitrum",
        legCount: SEEDED_DEPOSIT_COUNT,
        volumeUsd: "25.00",
      },
    ]);
  });

  it("discloses the priced share of the window", async () => {
    const coverage = await getJson<PricingCoverageDto>("/api/pricing-coverage?range=24h");

    expect(coverage).toEqual({
      pricedActivityCount: 2,
      unpricedActivityCount: 2,
      pendingActivityCount: 2,
      pricedCoverage: 0.5,
    });
  });
});

describe("public aggregates over a window where nothing has been priced yet", () => {
  beforeAll(async () => {
    await seedWindow(db.pool, NOTHING_PRICED_WINDOW);
  });

  it("reports zero totals on /api/stats rather than falling back to the client estimates", async () => {
    const stats = await getJson<StatsDto>("/api/stats");

    expect(stats).toEqual({
      dailyVolumeUsd: "0",
      totalVolumeUsd: "0",
      dailyTx: NOTHING_PRICED_WINDOW.length,
      totalTx: NOTHING_PRICED_WINDOW.length,
      activeAgents7d: 1,
    });
  });

  it("keeps the agent on the leaderboard at zero volume", async () => {
    const agents = await getJson<AgentStatDto[]>("/api/agents");

    expect(agents.map((agent) => ({ volumeUsd: agent.volumeUsd, txCount: agent.txCount }))).toEqual([
      { volumeUsd: "0", txCount: NOTHING_PRICED_WINDOW.length },
    ]);
  });

  it("returns zero volume on every chart range", async () => {
    const live = await getJson<ChartPointDto[]>("/api/chart?range=24h");
    const daily = await getJson<ChartPointDto[]>("/api/chart?range=30d");

    expect(totalVolumeOf(live)).toBe(0);
    expect(totalVolumeOf(daily)).toBe(0);
    expect(totalTxOf(live)).toBe(NOTHING_PRICED_WINDOW.length);
  });

  it("shows a day of transactions carrying no priced volume rather than an empty day", async () => {
    const daily = await getJson<ChartPointDto[]>("/api/chart?range=30d");
    const observed = daily.filter((point) => point.txCount > 0);

    expect(observed.map(({ volumeUsd, txCount }) => ({ volumeUsd, txCount }))).toEqual([
      { volumeUsd: "0", txCount: NOTHING_PRICED_WINDOW.length },
    ]);
  });

  it("returns zero volume for protocols, networks, tokens and routes", async () => {
    const protocols = await getJson<ProtocolStatDto[]>("/api/protocols");
    const networks = await getJson<NetworkStatDto[]>("/api/networks?range=24h");
    const tokens = await getJson<TokenStatDto[]>("/api/tokens?range=24h");
    const routes = await getJson<BridgeRouteDto[]>("/api/routes?range=24h");

    expect(protocols.map((protocol) => protocol.volumeUsd)).toEqual(["0", "0"]);
    expect(networkRowOf(networks, "base").volumeUsd).toBe("0");
    expect(tokenRowOf(tokens, usdcAddress).volumeUsd).toBe("0");
    expect(routes.map((route) => route.volumeUsd)).toEqual(["0"]);
  });

  it("discloses a priced coverage of zero without erroring", async () => {
    const coverage = await getJson<PricingCoverageDto>("/api/pricing-coverage?range=24h");

    expect(coverage).toEqual({
      pricedActivityCount: 0,
      unpricedActivityCount: 2,
      pendingActivityCount: 2,
      pricedCoverage: 0,
    });
  });
});

describe("windows where the coverage note must not claim the window was empty", () => {
  async function coverageOf(): Promise<PricingCoverageDto> {
    return getJson<PricingCoverageDto>("/api/pricing-coverage?range=24h");
  }

  it("measures nothing on a window whose verified rows all carry no usd leg", async () => {
    await seedWindow(db.pool, []);
    await seedActivity(db.pool, {
      ...pricedSwap,
      sourceRowId: "priced-fill-leg",
      kind: "bridge",
      eventRole: "bridge_fill_observed",
      usdInPriced: "5000.00",
    });
    await bookAggregatesForSeededActivities(db.pool);

    expect(await coverageOf()).toEqual({
      pricedActivityCount: 0,
      unpricedActivityCount: 0,
      pendingActivityCount: 0,
      pricedCoverage: 0,
    });
    expect(await getJson<StatsDto>("/api/stats")).toMatchObject({
      totalVolumeUsd: "0",
      totalTx: 1,
    });
    expect(await getJson<TokenStatDto[]>("/api/tokens?range=24h")).toEqual([]);
  });

  it("discloses a priced swap whose in leg never arrived as one it could not price", async () => {
    await seedWindow(db.pool, []);
    await seedActivity(db.pool, {
      ...pricedSwap,
      sourceRowId: "priced-without-in-leg",
      usdInPriced: null,
      usdOutPriced: "90.00",
    });
    await bookAggregatesForSeededActivities(db.pool);

    expect(await coverageOf()).toEqual({
      pricedActivityCount: 0,
      unpricedActivityCount: 1,
      pendingActivityCount: 0,
      pricedCoverage: 0,
    });
    expect(await getJson<StatsDto>("/api/stats")).toMatchObject({
      totalVolumeUsd: "0",
      totalTx: 1,
    });
  });

  it("keeps the purged agent's total while its activity leaves the coverage population", async () => {
    await seedWindow(db.pool, [pricedSwap]);
    const before = await getJson<StatsDto>("/api/stats");
    expect(before).toMatchObject({ totalVolumeUsd: "100.00", totalTx: 1 });
    expect(await coverageOf()).toMatchObject({ pricedActivityCount: 1, pricedCoverage: 1 });

    await db.pool.query("DELETE FROM activities WHERE agent_hash = $1", [agentHash]);

    expect(await getJson<StatsDto>("/api/stats")).toMatchObject({
      totalVolumeUsd: "100.00",
      totalTx: 1,
    });
    expect(await coverageOf()).toEqual({
      pricedActivityCount: 0,
      unpricedActivityCount: 0,
      pendingActivityCount: 0,
      pricedCoverage: 0,
    });
  });
});
