import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveBridgeChain, resolveChain, resolveChartRange } from "@agentscan/core";
import { evmChains, solanaChains } from "../../../../../packages/core/src/chain-registry/chains.js";
import { networkList, registryNetworks } from "../../repos/network-repo.js";
import {
  agentLeaderboard,
  chartBuckets,
  countActiveAgents7d,
  pricingCoverage,
  protocolRanking,
} from "../../repos/read-repo.js";
import { bridgeRoutes } from "../../repos/route-repo.js";
import { tokenListing } from "../../repos/token-repo.js";
import { startTestDb } from "../../testing/pg-harness.js";

const agentHash = "6".repeat(64);
const usdcAddress = "0xaaa1";
const DAY_WINDOW_SECONDS = 86_400;
const TOKEN_ROWS_MAX = 100;
const SETTLED_HOURS_AGO = 40;

const networks = registryNetworks(evmChains, solanaChains);

let db: Awaited<ReturnType<typeof startTestDb>>;

async function seedSettledBeforeItWasVerified(pool: pg.Pool): Promise<void> {
  await pool.query(
    `INSERT INTO activities
       (agent_hash, source_row_id, public_id, source_execution_id, event_index, kind, event_role, status,
        protocol, chain_family, chain_id, from_chain_id, to_chain_id,
        token_in_address, token_in_symbol, token_in_decimals,
        usd_in_priced, pricing_state, tx_hash,
        client_created_at, client_confirmed_at, block_time, statuses_seen,
        verification_state, verified_at, received_at, received_schema_version)
     VALUES ($1, 'settled-before-verified', 'settled-before-verified', 'settled-before-verified', 0,
             'bridge', 'bridge_deposit', 'confirmed',
             'relay', 'eip155', 8453, 8453, 42161,
             $2, 'USDC', 6,
             500.00, 'server_priced', '0xsettled',
             now() - make_interval(hours => $3::int), NULL,
             now() - make_interval(hours => $3::int), ARRAY['confirmed'],
             'verified_full', now(), now(), 1)`,
    [agentHash, usdcAddress, SETTLED_HOURS_AGO],
  );
}

beforeAll(async () => {
  db = await startTestDb();
  await db.pool.query(
    `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, first_verified_at)
     VALUES ($1, 'token-sha', 1, now(), now())`,
    [agentHash],
  );
  await seedSettledBeforeItWasVerified(db.pool);
}, 120_000);

afterAll(async () => {
  await db.stop();
});

describe("an activity settled before it was verified, carrying no client confirmation time", () => {
  it("buckets on its block time rather than the instant it was verified", async () => {
    const buckets = await chartBuckets(db.pool, resolveChartRange("24h"));

    expect(buckets.reduce((total, bucket) => total + bucket.txCount, 0)).toBe(0);
    expect(buckets.reduce((total, bucket) => total + Number(bucket.volumeUsd), 0)).toBe(0);
  });

  it("falls outside the leaderboard window that its verification instant sits inside", async () => {
    expect(await agentLeaderboard(db.pool, DAY_WINDOW_SECONDS)).toEqual([]);
  });

  it("falls outside the protocol ranking window", async () => {
    expect(await protocolRanking(db.pool, DAY_WINDOW_SECONDS)).toEqual([]);
  });

  it("falls outside the priced coverage window", async () => {
    expect(await pricingCoverage(db.pool, DAY_WINDOW_SECONDS)).toEqual({
      pricedActivityCount: 0,
      unpricedActivityCount: 0,
      pendingActivityCount: 0,
    });
  });

  it("falls outside the network window", async () => {
    const listed = await networkList(db.pool, {
      networks,
      plan: resolveChartRange("24h"),
      resolveBridgeChain,
    });
    const base = listed.find((network) => network.chainSlug === "base");

    expect(base).toMatchObject({ volumeUsd: "0", txCount: 0 });
  });

  it("falls outside the bridge route window", async () => {
    expect(await bridgeRoutes(db.pool, resolveChartRange("24h"), resolveBridgeChain)).toEqual([]);
  });

  it("falls outside the token listing window", async () => {
    expect(await tokenListing(db.pool, resolveChartRange("24h"), TOKEN_ROWS_MAX)).toEqual([]);
  });

  it("is inside every window wide enough to hold its block time", async () => {
    const buckets = await chartBuckets(db.pool, resolveChartRange("7d"));
    const listed = await networkList(db.pool, {
      networks,
      plan: resolveChartRange("7d"),
      resolveBridgeChain,
    });

    expect(buckets.reduce((total, bucket) => total + bucket.txCount, 0)).toBe(1);
    expect(await agentLeaderboard(db.pool, 7 * DAY_WINDOW_SECONDS)).toHaveLength(1);
    expect(listed.find((network) => network.chainSlug === "base")).toMatchObject({
      volumeUsd: "500.00",
      txCount: 1,
    });
    expect(await tokenListing(db.pool, resolveChartRange("7d"), TOKEN_ROWS_MAX)).toHaveLength(1);
  });

  it("counts toward the active agents of the trailing week", async () => {
    expect(await countActiveAgents7d(db.pool)).toBe(1);
  });
});

describe("the chain registry", () => {
  it("resolves the seeded chain so the window assertions are about the anchor", () => {
    expect(resolveChain({ protocol: "relay", chainFamily: "eip155", chainId: 8453n })).not.toBeNull();
  });
});
