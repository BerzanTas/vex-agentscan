import { fastify, type FastifyInstance } from "fastify";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveBridgeChain, resolveChain, resolveChartRange } from "@agentscan/core";
import { loadConfig } from "../../config.js";
import type { BridgeRouteDto } from "../../public-dto.js";
import { bridgeRoutes } from "../../repos/route-repo.js";
import { bridgeRouteRoutes } from "../../routes/public/routes.js";
import { startTestDb } from "../../testing/pg-harness.js";

const agentHash = "e".repeat(64);

type ActivitySeed = {
  sourceRowId: string;
  kind: string;
  eventRole: string;
  verificationState: string;
  protocol: string;
  fromChainId: string | null;
  toChainId: string | null;
  usdInEst: string;
  minutesAgo: number;
};

const verifiedBridgeDeposit = {
  kind: "bridge",
  eventRole: "bridge_deposit",
  verificationState: "verified_full",
  minutesAgo: 10,
} as const;

async function seedActivity(pool: pg.Pool, seed: ActivitySeed): Promise<void> {
  await pool.query(
    `INSERT INTO activities
       (agent_hash, source_row_id, public_id, source_execution_id, event_index, kind, event_role, status,
        protocol, chain_family, chain_id, from_chain_id, to_chain_id, usd_in_est, tx_hash,
        client_created_at, client_confirmed_at, statuses_seen, verification_state,
        received_at, received_schema_version)
     VALUES ($1, $2, $2, 'exec-1', 0, $3, $4, 'confirmed',
             $5, 'eip155', 8453, $6::bigint, $7::bigint, $8::numeric, '0xabc',
             now() - make_interval(mins => $9::int), now() - make_interval(mins => $9::int),
             ARRAY['confirmed'], $10, now(), 1)`,
    [
      agentHash,
      seed.sourceRowId,
      seed.kind,
      seed.eventRole,
      seed.protocol,
      seed.fromChainId,
      seed.toChainId,
      seed.usdInEst,
      seed.minutesAgo,
      seed.verificationState,
    ],
  );
}

let db: Awaited<ReturnType<typeof startTestDb>>;
let app: FastifyInstance;

async function routesFor(range: string): Promise<BridgeRouteDto[]> {
  return bridgeRoutes(db.pool, resolveChartRange(range), resolveBridgeChain);
}

function slugPairsOf(routes: BridgeRouteDto[]): string[] {
  return routes.map((route) => `${route.fromChainSlug}>${route.toChainSlug}`);
}

beforeAll(async () => {
  db = await startTestDb();
  await db.pool.query(
    `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at)
     VALUES ($1, 'token-sha', 1, now())`,
    [agentHash],
  );
  await seedActivity(db.pool, { ...verifiedBridgeDeposit, sourceRowId: "khalani-solana-base", protocol: "khalani", fromChainId: "20011000000", toChainId: "8453", usdInEst: "100.50" });
  await seedActivity(db.pool, { ...verifiedBridgeDeposit, sourceRowId: "relay-solana-base", protocol: "relay", fromChainId: "792703809", toChainId: "8453", usdInEst: "50.25" });
  await seedActivity(db.pool, { ...verifiedBridgeDeposit, sourceRowId: "relay-base-arbitrum-first", protocol: "relay", fromChainId: "8453", toChainId: "42161", usdInEst: "10.00" });
  await seedActivity(db.pool, { ...verifiedBridgeDeposit, sourceRowId: "relay-base-arbitrum-second", protocol: "relay", fromChainId: "8453", toChainId: "42161", usdInEst: "5.00" });
  await seedActivity(db.pool, { ...verifiedBridgeDeposit, sourceRowId: "relay-arbitrum-optimism-deposit", protocol: "relay", fromChainId: "42161", toChainId: "10", usdInEst: "1.00" });
  await seedActivity(db.pool, { ...verifiedBridgeDeposit, eventRole: "bridge_fill_observed", sourceRowId: "relay-arbitrum-optimism-fill", protocol: "relay", fromChainId: "42161", toChainId: "10", usdInEst: "500.00" });
  await seedActivity(db.pool, { ...verifiedBridgeDeposit, sourceRowId: "relay-polygon-base-verified", protocol: "relay", fromChainId: "137", toChainId: "8453", usdInEst: "20.00" });
  await seedActivity(db.pool, { ...verifiedBridgeDeposit, verificationState: "none", sourceRowId: "relay-polygon-base-unverified", protocol: "relay", fromChainId: "137", toChainId: "8453", usdInEst: "333.00" });
  await seedActivity(db.pool, { ...verifiedBridgeDeposit, verificationState: "mismatch", sourceRowId: "relay-polygon-base-mismatch", protocol: "relay", fromChainId: "137", toChainId: "8453", usdInEst: "222.00" });
  await seedActivity(db.pool, { ...verifiedBridgeDeposit, kind: "swap", eventRole: "swap", sourceRowId: "relay-base-optimism-swap", protocol: "relay", fromChainId: "8453", toChainId: "10", usdInEst: "444.00" });
  await seedActivity(db.pool, { ...verifiedBridgeDeposit, sourceRowId: "khalani-with-relay-solana-id", protocol: "khalani", fromChainId: "792703809", toChainId: "8453", usdInEst: "777.00" });
  await seedActivity(db.pool, { ...verifiedBridgeDeposit, sourceRowId: "relay-unknown-target-chain", protocol: "relay", fromChainId: "8453", toChainId: "999999999", usdInEst: "888.00" });
  await seedActivity(db.pool, { ...verifiedBridgeDeposit, sourceRowId: "relay-missing-from-leg", protocol: "relay", fromChainId: null, toChainId: "8453", usdInEst: "111.00" });
  await seedActivity(db.pool, { ...verifiedBridgeDeposit, sourceRowId: "relay-ethereum-base-outside-window", protocol: "relay", fromChainId: "1", toChainId: "8453", usdInEst: "60.00", minutesAgo: 57_600 });
  app = fastify();
  await app.register(bridgeRouteRoutes, {
    pool: db.pool,
    config: loadConfig({ DATABASE_URL: "postgres://unused-in-tests" }),
    resolveChain,
    resolveBridgeChain,
  });
}, 120_000);

afterAll(async () => {
  await app.close();
  await db.stop();
});

describe("bridgeRoutes", () => {
  it("merges the same chain reported under two provider-native ids into one route", async () => {
    const routes = await routesFor("all");

    expect(routes.filter((route) => route.fromChainSlug === "solana")).toEqual([
      { fromChainSlug: "solana", toChainSlug: "base", legCount: 2, volumeUsd: "150.75" },
    ]);
  });

  it("sums two legs reported on the same pair", async () => {
    const routes = await routesFor("all");

    expect(routes.filter((route) => route.toChainSlug === "arbitrum")).toEqual([
      { fromChainSlug: "base", toChainSlug: "arbitrum", legCount: 2, volumeUsd: "15.00" },
    ]);
  });

  it("counts a fill leg without adding its estimate to the volume", async () => {
    const routes = await routesFor("all");

    expect(routes.filter((route) => route.fromChainSlug === "arbitrum")).toEqual([
      { fromChainSlug: "arbitrum", toChainSlug: "optimism", legCount: 2, volumeUsd: "1.00" },
    ]);
  });

  it("counts only verified legs", async () => {
    const routes = await routesFor("all");

    expect(routes.filter((route) => route.fromChainSlug === "polygon")).toEqual([
      { fromChainSlug: "polygon", toChainSlug: "base", legCount: 1, volumeUsd: "20.00" },
    ]);
  });

  it("drops a leg whose id is unknown to the registry and keeps the rest", async () => {
    const routes = await routesFor("all");

    expect(slugPairsOf(routes)).toEqual([
      "solana>base",
      "ethereum>base",
      "polygon>base",
      "base>arbitrum",
      "arbitrum>optimism",
    ]);
  });

  it("builds no route from a swap", async () => {
    const routes = await routesFor("all");

    expect(routes.filter((route) => route.fromChainSlug === "base" && route.toChainSlug === "optimism")).toEqual([]);
  });

  it("orders routes by volume descending", async () => {
    const routes = await routesFor("all");

    expect(routes.map((route) => route.volumeUsd)).toEqual(["150.75", "60.00", "20.00", "15.00", "1.00"]);
  });

  it("leaves a leg confirmed before the window out of the range", async () => {
    const routes = await routesFor("24h");

    expect(slugPairsOf(routes)).toEqual(["solana>base", "polygon>base", "base>arbitrum", "arbitrum>optimism"]);
  });
});

describe("GET /api/routes", () => {
  it("serves the folded routes for the requested range", async () => {
    const response = await app.inject({ method: "GET", url: "/api/routes?range=all" });

    expect(response.json<BridgeRouteDto[]>()).toEqual([
      { fromChainSlug: "solana", toChainSlug: "base", legCount: 2, volumeUsd: "150.75" },
      { fromChainSlug: "ethereum", toChainSlug: "base", legCount: 1, volumeUsd: "60.00" },
      { fromChainSlug: "polygon", toChainSlug: "base", legCount: 1, volumeUsd: "20.00" },
      { fromChainSlug: "base", toChainSlug: "arbitrum", legCount: 2, volumeUsd: "15.00" },
      { fromChainSlug: "arbitrum", toChainSlug: "optimism", legCount: 2, volumeUsd: "1.00" },
    ]);
  });

  it("degrades an unknown range to thirty days", async () => {
    const response = await app.inject({ method: "GET", url: "/api/routes?range=nonsense" });

    expect(slugPairsOf(response.json<BridgeRouteDto[]>())).toEqual([
      "solana>base",
      "polygon>base",
      "base>arbitrum",
      "arbitrum>optimism",
    ]);
  });
});
