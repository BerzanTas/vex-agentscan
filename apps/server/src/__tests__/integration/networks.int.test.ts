import { fastify, type FastifyInstance } from "fastify";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveBridgeChain, resolveChain } from "@agentscan/core";
import { loadConfig } from "../../config.js";
import type { NetworkDetailDto, NetworkStatDto } from "../../public-dto.js";
import { networksRoutes } from "../../routes/public/networks.js";
import { startTestDb } from "../../testing/pg-harness.js";

const agentHash = "e".repeat(64);
const confirmedMinutesAgo = 10;

const usdcOnBase = "0xA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48";
const wethOnBase = "0x4200000000000000000000000000000000000006";

type ActivitySeed = {
  publicId: string;
  protocol: string;
  chainFamily: "eip155" | "solana";
  chainId: string;
  kind: "swap" | "bridge";
  eventRole: string;
  verificationState: string;
  usdInPriced: string | null;
  usdOutPriced?: string | null;
  pricingState?: "server_priced" | "unpriced" | "pending";
  fromChainId?: string | null;
  toChainId?: string | null;
  tokenInAddress?: string | null;
  tokenInSymbol?: string | null;
  tokenOutAddress?: string | null;
  tokenOutSymbol?: string | null;
};

async function seedActivity(pool: pg.Pool, seed: ActivitySeed): Promise<void> {
  await pool.query(
    `INSERT INTO activities
       (agent_hash, source_row_id, public_id, source_execution_id, event_index,
        kind, event_role, status, protocol, chain_family, chain_id, from_chain_id, to_chain_id,
        token_in_address, token_in_symbol, token_in_decimals,
        token_out_address, token_out_symbol, token_out_decimals,
        amount_in_raw, usd_in_priced, usd_out_priced, pricing_state, tx_hash,
        client_created_at, client_confirmed_at, statuses_seen, verification_state, verified_at,
        received_at, received_schema_version)
     VALUES ($1, $2, $2, $2, 0,
             $3, $4, 'confirmed', $5, $6, $7::bigint, $8::bigint, $9::bigint,
             $10, $11, 6,
             $12, $13, 18,
             '1000000000000000000', $14::numeric, $15::numeric, $18, '0xhash' || $2,
             now() - make_interval(mins => $16::int), now() - make_interval(mins => $16::int),
             ARRAY['confirmed'], $17, now(),
             now(), 1)`,
    [
      agentHash,
      seed.publicId,
      seed.kind,
      seed.eventRole,
      seed.protocol,
      seed.chainFamily,
      seed.chainId,
      seed.fromChainId ?? null,
      seed.toChainId ?? null,
      seed.tokenInAddress ?? null,
      seed.tokenInSymbol ?? null,
      seed.tokenOutAddress ?? null,
      seed.tokenOutSymbol ?? null,
      seed.usdInPriced,
      seed.usdOutPriced ?? null,
      confirmedMinutesAgo,
      seed.verificationState,
      seed.pricingState ?? "server_priced",
    ],
  );
}

let db: Awaited<ReturnType<typeof startTestDb>>;
let app: FastifyInstance;

beforeAll(async () => {
  db = await startTestDb();
  await db.pool.query(
    `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, first_verified_at)
     VALUES ($1, 'token-sha', 1, now(), now())`,
    [agentHash],
  );
  await seedActivity(db.pool, {
    publicId: "base-swap",
    protocol: "kyberswap",
    chainFamily: "eip155",
    chainId: "8453",
    kind: "swap",
    eventRole: "swap",
    verificationState: "verified_full",
    usdInPriced: "100.50",
    usdOutPriced: "100.00",
    tokenInAddress: usdcOnBase,
    tokenInSymbol: "USDC",
    tokenOutAddress: wethOnBase,
    tokenOutSymbol: "WETH",
  });
  await seedActivity(db.pool, {
    publicId: "base-fill",
    protocol: "relay",
    chainFamily: "eip155",
    chainId: "8453",
    kind: "bridge",
    eventRole: "bridge_fill_observed",
    verificationState: "verified_full",
    usdInPriced: "77.00",
  });
  await seedActivity(db.pool, {
    publicId: "base-deposit",
    protocol: "relay",
    chainFamily: "eip155",
    chainId: "8453",
    kind: "bridge",
    eventRole: "bridge_deposit",
    verificationState: "verified_full",
    usdInPriced: "25.00",
    fromChainId: "8453",
    toChainId: "42161",
  });
  await seedActivity(db.pool, {
    publicId: "base-stale-priced-swap",
    protocol: "kyberswap",
    chainFamily: "eip155",
    chainId: "8453",
    kind: "swap",
    eventRole: "swap",
    verificationState: "verified_full",
    pricingState: "unpriced",
    usdInPriced: "700.00",
    usdOutPriced: "600.00",
    tokenInAddress: usdcOnBase,
    tokenInSymbol: "USDC",
    tokenOutAddress: wethOnBase,
    tokenOutSymbol: "WETH",
  });
  await seedActivity(db.pool, {
    publicId: "base-stale-priced-deposit",
    protocol: "relay",
    chainFamily: "eip155",
    chainId: "8453",
    kind: "bridge",
    eventRole: "bridge_deposit",
    verificationState: "verified_full",
    pricingState: "pending",
    usdInPriced: "900.00",
    fromChainId: "8453",
    toChainId: "42161",
  });
  await seedActivity(db.pool, {
    publicId: "optimism-unverified",
    protocol: "kyberswap",
    chainFamily: "eip155",
    chainId: "10",
    kind: "swap",
    eventRole: "swap",
    verificationState: "none",
    usdInPriced: "999.00",
  });
  await seedActivity(db.pool, {
    publicId: "solana-deposit",
    protocol: "khalani",
    chainFamily: "solana",
    chainId: "20011000000",
    kind: "bridge",
    eventRole: "bridge_deposit",
    verificationState: "verified_basic",
    usdInPriced: "40.00",
    fromChainId: "20011000000",
    toChainId: "8453",
  });
  await seedActivity(db.pool, {
    publicId: "polygon-unknown-route",
    protocol: "relay",
    chainFamily: "eip155",
    chainId: "137",
    kind: "bridge",
    eventRole: "bridge_deposit",
    verificationState: "verified_full",
    usdInPriced: "60.00",
    fromChainId: "999999",
    toChainId: "888888",
  });
  const config = loadConfig({
    DATABASE_URL: "postgres://unused-in-tests",
    READ_CACHE_TTL_SEC: "0",
  });
  app = fastify();
  await app.register(networksRoutes, {
    pool: db.pool,
    config,
    resolveChain,
    resolveBridgeChain,
  });
}, 120_000);

afterAll(async () => {
  await app.close();
  await db.stop();
});

async function listNetworks(): Promise<NetworkStatDto[]> {
  const response = await app.inject({ method: "GET", url: "/api/networks?range=24h" });
  expect(response.statusCode).toBe(200);
  return response.json<NetworkStatDto[]>();
}

async function networkNamed(chainSlug: string): Promise<NetworkStatDto> {
  const rows = await listNetworks();
  const row = rows.find((candidate) => candidate.chainSlug === chainSlug);
  if (row === undefined) throw new Error(`${chainSlug} missing from the listing`);
  return row;
}

async function detailOf(chainSlug: string): Promise<NetworkDetailDto> {
  const response = await app.inject({ method: "GET", url: `/api/networks/${chainSlug}?range=24h` });
  expect(response.statusCode).toBe(200);
  return response.json<NetworkDetailDto>();
}

function bridgeCountsOf(row: NetworkStatDto): { bridgeInCount: number; bridgeOutCount: number } {
  return { bridgeInCount: row.bridgeInCount, bridgeOutCount: row.bridgeOutCount };
}

describe("the fixture the volume assertions rely on", () => {
  it("carries a stale server price on every row the server has not priced", async () => {
    const stale = await db.pool.query<{
      public_id: string;
      usd_in_priced: string | null;
      usd_out_priced: string | null;
      pricing_state: string;
    }>(
      `SELECT public_id, usd_in_priced::text AS usd_in_priced, usd_out_priced::text AS usd_out_priced,
              pricing_state
       FROM activities
       WHERE pricing_state <> 'server_priced'
       ORDER BY public_id`,
    );

    expect(stale.rows).toEqual([
      {
        public_id: "base-stale-priced-deposit",
        usd_in_priced: "900.00",
        usd_out_priced: null,
        pricing_state: "pending",
      },
      {
        public_id: "base-stale-priced-swap",
        usd_in_priced: "700.00",
        usd_out_priced: "600.00",
        pricing_state: "unpriced",
      },
    ]);
  });
});

describe("GET /api/networks", () => {
  it("lists one row per network in the chain registry", async () => {
    const rows = await listNetworks();

    expect(rows.map((row) => row.chainSlug)).toEqual([
      "ethereum",
      "base",
      "arbitrum",
      "optimism",
      "polygon",
      "robinhood",
      "solana",
    ]);
  });

  it("keeps a supported network without any activity on the list with zeros", async () => {
    expect(await networkNamed("ethereum")).toEqual({
      chainSlug: "ethereum",
      displayName: "Ethereum",
      verificationTier: "full",
      volumeUsd: "0",
      txCount: 0,
      bridgeInCount: 0,
      bridgeOutCount: 0,
      lastSeenSeconds: null,
    });
  });

  it("takes the verification tier from the registry, not from the data", async () => {
    expect((await networkNamed("solana")).verificationTier).toBe("basic");
    expect((await networkNamed("base")).verificationTier).toBe("full");
  });

  it("sums volume only for swap and bridge_deposit legs", async () => {
    const base = await networkNamed("base");

    expect(base.volumeUsd).toBe("125.50");
    expect(base.txCount).toBe(5);
  });

  it("leaves a network whose only activity is unverified at zero with no last seen", async () => {
    expect(await networkNamed("optimism")).toEqual({
      chainSlug: "optimism",
      displayName: "OP Mainnet",
      verificationTier: "full",
      volumeUsd: "0",
      txCount: 0,
      bridgeInCount: 0,
      bridgeOutCount: 0,
      lastSeenSeconds: null,
    });
  });

  it("reports the age of the newest verified activity as last seen", async () => {
    const base = await networkNamed("base");

    expect(base.lastSeenSeconds).toBeGreaterThanOrEqual(confirmedMinutesAgo * 60);
    expect(base.lastSeenSeconds).toBeLessThan(confirmedMinutesAgo * 60 + 300);
  });

  it("counts a bridge leg out of the network its from_chain_id resolves to", async () => {
    expect(bridgeCountsOf(await networkNamed("base"))).toEqual({ bridgeInCount: 1, bridgeOutCount: 2 });
    expect(bridgeCountsOf(await networkNamed("solana"))).toEqual({ bridgeInCount: 0, bridgeOutCount: 1 });
  });

  it("counts a bridge leg into the network its to_chain_id resolves to even without local activity", async () => {
    expect(await networkNamed("arbitrum")).toEqual({
      chainSlug: "arbitrum",
      displayName: "Arbitrum One",
      verificationTier: "full",
      volumeUsd: "0",
      txCount: 0,
      bridgeInCount: 2,
      bridgeOutCount: 0,
      lastSeenSeconds: null,
    });
  });

  it("counts a bridge leg whose chain id is unknown to the registry for no network", async () => {
    const rows = await listNetworks();
    const legsCounted = rows.reduce((total, row) => total + row.bridgeInCount + row.bridgeOutCount, 0);

    expect(legsCounted).toBe(6);
    expect(bridgeCountsOf(await networkNamed("polygon"))).toEqual({ bridgeInCount: 0, bridgeOutCount: 0 });
  });
});

describe("GET /api/networks/:slug", () => {
  it("reports the observed volume and transaction count of the window", async () => {
    const detail = await detailOf("base");

    expect(detail.volumeUsd).toBe("125.50");
    expect(detail.txCount).toBe(5);
    expect(detail.displayName).toBe("Base");
    expect(detail.verificationTier).toBe("full");
  });

  it("breaks the network down by protocol without the non-volume legs", async () => {
    const detail = await detailOf("base");

    expect(detail.protocols).toEqual([
      { protocol: "kyberswap", volumeUsd: "100.50", txCount: 2 },
      { protocol: "relay", volumeUsd: "25.00", txCount: 3 },
    ]);
  });

  it("ranks the most traded tokens of the network with lowercased addresses", async () => {
    const detail = await detailOf("base");

    expect(detail.tokens).toEqual([
      {
        address: usdcOnBase.toLowerCase(),
        symbol: "USDC",
        volumeUsd: "100.50",
        txCount: 2,
      },
      {
        address: wethOnBase,
        symbol: "WETH",
        volumeUsd: "100.00",
        txCount: 2,
      },
    ]);
  });

  it("lists the bridge routes into and out of the network by volume", async () => {
    const detail = await detailOf("base");

    expect(detail.routes).toEqual([
      { fromChainSlug: "solana", toChainSlug: "base", legCount: 1, volumeUsd: "40.00" },
      { fromChainSlug: "base", toChainSlug: "arbitrum", legCount: 2, volumeUsd: "25.00" },
    ]);
  });

  it("leaves out a route whose chain id the registry cannot resolve", async () => {
    const detail = await detailOf("polygon");

    expect(detail.volumeUsd).toBe("60.00");
    expect(detail.routes).toEqual([]);
  });

  it("returns the window as chart points of the shared series shape", async () => {
    const detail = await detailOf("base");
    const observed = detail.series.filter((point) => point.txCount > 0);

    expect(detail.series).toHaveLength(24);
    expect(detail.series.every((point) => point.bucketStart % 3600 === 0)).toBe(true);
    expect(observed.map(({ volumeUsd, txCount }) => ({ volumeUsd, txCount }))).toEqual([
      { volumeUsd: "125.50", txCount: 5 },
    ]);
  });

  it("answers not_found for a slug outside the registry", async () => {
    const response = await app.inject({ method: "GET", url: "/api/networks/does-not-exist" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: "not_found", message: "network not found" },
    });
  });

  it("reads a slug given in upper case as the canonical network", async () => {
    const detail = await detailOf("BASE");

    expect(detail.chainSlug).toBe("base");
  });
});
