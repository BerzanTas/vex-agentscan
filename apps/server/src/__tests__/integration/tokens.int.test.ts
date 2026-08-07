import { fastify, type FastifyInstance } from "fastify";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveBridgeChain, resolveChain } from "@agentscan/core";
import { loadConfig } from "../../config.js";
import type { TokenDetailDto, TokenStatDto } from "../../public-dto.js";
import { tokensRoutes } from "../../routes/public/tokens.js";
import { startTestDb } from "../../testing/pg-harness.js";

const agentA = "a".repeat(64);
const agentB = "b".repeat(64);

const usdcAddress = "0xAAA1";
const wethAddress = "0xBbB2";
const daiAddress = "0xCCC3";
const orphanAddress = "0xDDD4";
const vexAddress = "0xEEE5";
const otherAddress = "0xFFF6";
const oldAddress = "0x1117";
const todayAddress = "0xFED8";

const base = 8453;
const arbitrum = 42161;
const unregisteredChain = 999;

const hourAgo = 60;
const tenMinutesAgo = 10;
const rightNow = 0;
const fortyDaysAgo = 40 * 24 * 60;

const DAY_SECONDS = 86_400;

type TokenLeg = { address: string; symbol: string; decimals: number; usd: string | null };

type ActivitySeed = {
  agentHash: string;
  sourceRowId: string;
  chainId: number;
  protocol: string;
  kind: "swap" | "bridge";
  eventRole: "swap" | "bridge_deposit";
  tokenIn: TokenLeg | null;
  tokenOut: TokenLeg | null;
  verificationState: string;
  minutesAgo: number;
};

async function seedAgent(pool: pg.Pool, agentHash: string): Promise<void> {
  await pool.query(
    `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, first_verified_at)
     VALUES ($1, 'token-sha', 1, now(), now())`,
    [agentHash],
  );
}

async function seedActivity(pool: pg.Pool, seed: ActivitySeed): Promise<void> {
  await pool.query(
    `INSERT INTO activities
       (agent_hash, source_row_id, public_id, source_execution_id, event_index, kind, event_role, status,
        protocol, chain_family, chain_id,
        token_in_address, token_in_symbol, token_in_decimals,
        token_out_address, token_out_symbol, token_out_decimals,
        usd_in_est, usd_out_est, tx_hash,
        client_created_at, client_confirmed_at, statuses_seen, verification_state, verified_at,
        received_at, received_schema_version)
     VALUES ($1, $2, $2, 'exec-' || $2, 0, $3, $4, 'confirmed',
             $5, 'eip155', $6::bigint,
             $7, $8, $9::smallint,
             $10, $11, $12::smallint,
             $13::numeric, $14::numeric, '0xabc',
             now() - make_interval(mins => $15::int), now() - make_interval(mins => $15::int),
             ARRAY['confirmed'], $16, now(), now(), 1)`,
    [
      seed.agentHash,
      seed.sourceRowId,
      seed.kind,
      seed.eventRole,
      seed.protocol,
      seed.chainId,
      seed.tokenIn?.address ?? null,
      seed.tokenIn?.symbol ?? null,
      seed.tokenIn?.decimals ?? null,
      seed.tokenOut?.address ?? null,
      seed.tokenOut?.symbol ?? null,
      seed.tokenOut?.decimals ?? null,
      seed.tokenIn?.usd ?? null,
      seed.tokenOut?.usd ?? null,
      seed.minutesAgo,
      seed.verificationState,
    ],
  );
}

function usdc(usd: string | null, symbol = "USDC"): TokenLeg {
  return { address: usdcAddress, symbol, decimals: 6, usd };
}

function weth(usd: string | null, symbol = "WETH"): TokenLeg {
  return { address: wethAddress, symbol, decimals: 18, usd };
}

function dai(usd: string | null): TokenLeg {
  return { address: daiAddress, symbol: "DAI", decimals: 18, usd };
}

const swapOnBase = {
  chainId: base,
  protocol: "kyberswap",
  kind: "swap",
  eventRole: "swap",
  verificationState: "verified_full",
  minutesAgo: hourAgo,
} as const;

let db: Awaited<ReturnType<typeof startTestDb>>;
let app: FastifyInstance;

async function fetchTokens(query: string): Promise<TokenStatDto[]> {
  const response = await app.inject({ method: "GET", url: `/api/tokens${query}` });
  expect(response.statusCode).toBe(200);
  return response.json<TokenStatDto[]>();
}

function rowOf(tokens: TokenStatDto[], chainSlug: string, address: string): TokenStatDto {
  const row = tokens.find((token) => token.chainSlug === chainSlug && token.address === address);
  if (row === undefined) throw new Error(`no listed token ${chainSlug}/${address}`);
  return row;
}

beforeAll(async () => {
  db = await startTestDb();
  await seedAgent(db.pool, agentA);
  await seedAgent(db.pool, agentB);
  await seedActivity(db.pool, {
    ...swapOnBase,
    agentHash: agentA,
    sourceRowId: "row-usdc-weth",
    tokenIn: usdc("100.00"),
    tokenOut: weth("100.00"),
  });
  await seedActivity(db.pool, {
    ...swapOnBase,
    agentHash: agentA,
    sourceRowId: "row-weth-dai",
    tokenIn: weth("40.00"),
    tokenOut: dai("40.00"),
  });
  await seedActivity(db.pool, {
    ...swapOnBase,
    agentHash: agentB,
    sourceRowId: "row-weth-usdc",
    protocol: "uniswap",
    verificationState: "verified_basic",
    tokenIn: weth("5.00"),
    tokenOut: usdc("5.00"),
  });
  await seedActivity(db.pool, {
    ...swapOnBase,
    agentHash: agentA,
    sourceRowId: "row-bridge-arbitrum",
    chainId: arbitrum,
    kind: "bridge",
    eventRole: "bridge_deposit",
    tokenIn: usdc("20.00"),
    tokenOut: null,
  });
  await seedActivity(db.pool, {
    ...swapOnBase,
    agentHash: agentA,
    sourceRowId: "row-without-estimate",
    tokenIn: { address: vexAddress, symbol: "VEX", decimals: 18, usd: null },
    tokenOut: { address: otherAddress, symbol: "OTH", decimals: 18, usd: null },
  });
  await seedActivity(db.pool, {
    ...swapOnBase,
    agentHash: agentA,
    sourceRowId: "row-unregistered-chain",
    chainId: unregisteredChain,
    tokenIn: { address: orphanAddress, symbol: "ORP", decimals: 18, usd: "0.50" },
    tokenOut: null,
  });
  await seedActivity(db.pool, {
    ...swapOnBase,
    agentHash: agentA,
    sourceRowId: "row-unverified",
    verificationState: "none",
    tokenIn: usdc("999.00"),
    tokenOut: weth("999.00"),
  });
  await seedActivity(db.pool, {
    ...swapOnBase,
    agentHash: agentA,
    sourceRowId: "row-eth-alias",
    tokenIn: weth("1.00", "ETH"),
    tokenOut: dai("1.00"),
  });
  await seedActivity(db.pool, {
    ...swapOnBase,
    agentHash: agentA,
    sourceRowId: "row-usdc-weth-again",
    minutesAgo: tenMinutesAgo,
    tokenIn: usdc("2.00"),
    tokenOut: weth("2.00"),
  });
  await seedActivity(db.pool, {
    ...swapOnBase,
    agentHash: agentA,
    sourceRowId: "row-outside-window",
    minutesAgo: fortyDaysAgo,
    tokenIn: { address: oldAddress, symbol: "OLD", decimals: 18, usd: "7.00" },
    tokenOut: null,
  });
  await seedActivity(db.pool, {
    ...swapOnBase,
    agentHash: agentA,
    sourceRowId: "row-today-only",
    chainId: arbitrum,
    minutesAgo: rightNow,
    tokenIn: { address: todayAddress, symbol: "TDY", decimals: 18, usd: "3.00" },
    tokenOut: null,
  });
  const config = loadConfig({ DATABASE_URL: "postgres://unused-in-tests", READ_CACHE_TTL_SEC: "0" });
  app = fastify();
  await app.register(tokensRoutes, { pool: db.pool, config, resolveChain, resolveBridgeChain });
}, 120_000);

afterAll(async () => {
  await app.close();
  await db.stop();
});

describe("GET /api/tokens", () => {
  it("sums the matching leg of every swap the token took part in", async () => {
    const row = rowOf(await fetchTokens(""), "base", "0xbbb2");

    expect(row.volumeUsd).toBe("148.00");
    expect(row.txCount).toBe(5);
  });

  it("labels the token with the symbol reported most often for its address", async () => {
    expect(rowOf(await fetchTokens(""), "base", "0xbbb2").symbol).toBe("WETH");
  });

  it("keeps one address seen on two chains as two rows", async () => {
    const tokens = await fetchTokens("");
    const shared = tokens.filter((token) => token.address === "0xaaa1");

    expect(shared.map((token) => ({ chainSlug: token.chainSlug, volumeUsd: token.volumeUsd }))).toEqual([
      { chainSlug: "base", volumeUsd: "107.00" },
      { chainSlug: "arbitrum", volumeUsd: "20.00" },
    ]);
  });

  it("leaves unverified activity out of the listing", async () => {
    const row = rowOf(await fetchTokens(""), "base", "0xaaa1");

    expect(row.volumeUsd).toBe("107.00");
    expect(row.txCount).toBe(3);
  });

  it("counts a leg without a usd estimate in txCount and not in volume", async () => {
    const row = rowOf(await fetchTokens(""), "base", "0xeee5");

    expect(row.volumeUsd).toBe("0");
    expect(row.txCount).toBe(1);
  });

  it("counts distinct agents rather than activities", async () => {
    const row = rowOf(await fetchTokens(""), "base", "0xbbb2");

    expect(row.agentCount).toBe(2);
  });

  it("lists every protocol that traded the token", async () => {
    expect(rowOf(await fetchTokens(""), "base", "0xbbb2").protocols).toEqual(["kyberswap", "uniswap"]);
  });

  it("reports the age of the newest activity of the token", async () => {
    const row = rowOf(await fetchTokens(""), "base", "0xbbb2");

    expect(row.lastSeenSeconds).toBeGreaterThanOrEqual(600);
    expect(row.lastSeenSeconds).toBeLessThan(700);
  });

  it("drops a token whose chain is not in the registry", async () => {
    const tokens = await fetchTokens("");

    expect(tokens.some((token) => token.address === "0xddd4")).toBe(false);
  });

  it("attributes a swap to both of its tokens so the column doubles the observed volume", async () => {
    const tokens = await fetchTokens("");
    const onBase = tokens.filter((token) => token.chainSlug === "base");
    const attributed = onBase.reduce((total, token) => total + Number(token.volumeUsd), 0);

    expect(attributed).toBe(2 * 148);
  });

  it("excludes activity older than the requested window", async () => {
    const inWindow = await fetchTokens("?range=30d");

    expect(inWindow.some((token) => token.address === "0x1117")).toBe(false);
  });

  it("includes every activity for the all range", async () => {
    const everything = await fetchTokens("?range=all");

    expect(rowOf(everything, "base", "0x1117").volumeUsd).toBe("7.00");
  });
});

describe("GET /api/tokens sparkline", () => {
  it("gives every listed token exactly seven daily points", async () => {
    const tokens = await fetchTokens("");

    expect(tokens.map((token) => token.series.length)).toEqual([7, 7, 7, 7, 7, 7, 7]);
  });

  it("leaves the six buckets before today empty for a token first seen today", async () => {
    const series = rowOf(await fetchTokens(""), "arbitrum", "0xfed8").series;

    expect(series.map((point) => point.volumeUsd)).toEqual(["0", "0", "0", "0", "0", "0", "3.00"]);
    expect(series.map((point) => point.txCount)).toEqual([0, 0, 0, 0, 0, 0, 1]);
  });

  it("orders the buckets from oldest to newest in daily steps", async () => {
    const series = rowOf(await fetchTokens(""), "arbitrum", "0xfed8").series;
    const newest = series.at(-1)?.bucketStart ?? 0;

    expect(series.map((point) => point.bucketStart)).toEqual([
      newest - 6 * DAY_SECONDS,
      newest - 5 * DAY_SECONDS,
      newest - 4 * DAY_SECONDS,
      newest - 3 * DAY_SECONDS,
      newest - 2 * DAY_SECONDS,
      newest - DAY_SECONDS,
      newest,
    ]);
  });

  it("zero fills all seven buckets for a token last active before the sparkline window", async () => {
    const series = rowOf(await fetchTokens("?range=all"), "base", "0x1117").series;

    expect(series.map((point) => point.volumeUsd)).toEqual(["0", "0", "0", "0", "0", "0", "0"]);
    expect(series.map((point) => point.txCount)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("splits the seven day volume of a token across its buckets without losing any of it", async () => {
    const row = rowOf(await fetchTokens("?range=7d"), "base", "0xbbb2");
    const bucketed = row.series.reduce((total, point) => total + Number(point.volumeUsd), 0);

    expect(bucketed).toBe(Number(row.volumeUsd));
  });

  it("keeps the same seven buckets whatever range the listing was asked for", async () => {
    const inDay = rowOf(await fetchTokens("?range=24h"), "arbitrum", "0xfed8").series;
    const everything = rowOf(await fetchTokens("?range=all"), "arbitrum", "0xfed8").series;

    expect(everything).toEqual(inDay);
  });
});

describe("GET /api/tokens with a limit above the cap", () => {
  beforeAll(async () => {
    await db.pool.query(
      `INSERT INTO activities
         (agent_hash, source_row_id, public_id, source_execution_id, event_index, kind, event_role, status,
          protocol, chain_family, chain_id, token_in_address, token_in_symbol, token_in_decimals,
          usd_in_est, tx_hash, client_created_at, client_confirmed_at, statuses_seen,
          verification_state, verified_at, received_at, received_schema_version)
       SELECT $1, 'filler-' || n, 'filler-' || n, 'exec-filler', 0, 'swap', 'swap', 'confirmed',
              'kyberswap', 'eip155', $2::bigint, '0xF1' || lpad(n::text, 4, '0'), 'FIL', 18,
              1.00, '0xabc', now(), now(), ARRAY['confirmed'],
              'verified_full', now(), now(), 1
       FROM generate_series(1, 120) AS n`,
      [agentA, arbitrum],
    );
  });

  afterAll(async () => {
    await db.pool.query("DELETE FROM activities WHERE source_row_id LIKE 'filler-%'");
  });

  it("caps the returned rows at one hundred", async () => {
    expect(await fetchTokens("?limit=500")).toHaveLength(100);
  });
});

describe("GET /api/tokens/:chainSlug/:address", () => {
  async function fetchDetail(path: string): Promise<TokenDetailDto> {
    const response = await app.inject({ method: "GET", url: `/api/tokens/${path}` });
    expect(response.statusCode).toBe(200);
    return response.json<TokenDetailDto>();
  }

  it("serves the totals of one token on one chain", async () => {
    const detail = await fetchDetail("base/0xbbb2");

    expect(detail.chainSlug).toBe("base");
    expect(detail.address).toBe("0xbbb2");
    expect(detail.symbol).toBe("WETH");
    expect(detail.decimals).toBe(18);
    expect(detail.volumeUsd).toBe("148.00");
    expect(detail.txCount).toBe(5);
    expect(detail.agentCount).toBe(2);
  });

  it("finds the same token for an upper case address in the path", async () => {
    const detail = await fetchDetail("base/0xBBB2");

    expect(detail.address).toBe("0xbbb2");
    expect(detail.volumeUsd).toBe("148.00");
  });

  it("breaks the observed volume down by protocol", async () => {
    expect((await fetchDetail("base/0xbbb2")).protocols).toEqual([
      { protocol: "kyberswap", volumeUsd: "143.00", txCount: 4 },
      { protocol: "uniswap", volumeUsd: "5.00", txCount: 1 },
    ]);
  });

  it("ranks the token pairs by how often they were traded", async () => {
    expect((await fetchDetail("base/0xbbb2")).pairs).toEqual([
      { tokenInSymbol: "USDC", tokenOutSymbol: "WETH", txCount: 2 },
      { tokenInSymbol: "ETH", tokenOutSymbol: "DAI", txCount: 1 },
      { tokenInSymbol: "WETH", tokenOutSymbol: "DAI", txCount: 1 },
      { tokenInSymbol: "WETH", tokenOutSymbol: "USDC", txCount: 1 },
    ]);
  });

  it("returns one series bucket per hour of the 24h range", async () => {
    const series = (await fetchDetail("base/0xbbb2?range=24h")).series;

    expect(series).toHaveLength(24);
    expect(series.every((point) => point.bucketStart % 3600 === 0)).toBe(true);
  });

  it("returns one series bucket per day of the 30d range", async () => {
    expect((await fetchDetail("base/0xbbb2?range=30d")).series).toHaveLength(30);
  });

  it("starts the series at the oldest activity of the token for the all range", async () => {
    const series = (await fetchDetail("base/0x1117?range=all")).series;

    expect(series).toHaveLength(41);
    expect(series[0]?.volumeUsd).toBe("7.00");
    expect(series[0]?.txCount).toBe(1);
    expect(series.at(-1)?.volumeUsd).toBe("0");
  });

  it("splits the token volume across the series without losing any of it", async () => {
    const detail = await fetchDetail("base/0xbbb2?range=24h");
    const bucketed = detail.series.reduce((total, point) => total + Number(point.volumeUsd), 0);

    expect(bucketed).toBe(Number(detail.volumeUsd));
  });

  it("answers not_found for an address nobody traded", async () => {
    const response = await app.inject({ method: "GET", url: "/api/tokens/base/0x9999" });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("not_found");
  });

  it("answers not_found for a token that exists only on another chain", async () => {
    const response = await app.inject({ method: "GET", url: "/api/tokens/arbitrum/0xccc3" });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("not_found");
  });
});
