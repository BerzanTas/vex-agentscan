import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveBridgeChain, resolveChartRange } from "@agentscan/core";
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
import { activityTimeAnchorSql } from "../../repos/activity-time-anchor.js";
import { startTestDb } from "../../testing/pg-harness.js";

const ANCHOR_INDEX = "idx_activities_verified_anchor";
const ANCHOR_EXPRESSION = activityTimeAnchorSql("a").replaceAll("a.", "");
const WINDOW_SECONDS = 30 * 86_400;
const TOKEN_ROWS_MAX = 100;

const agentHash = "5".repeat(64);

type CapturedQuery = { text: string; values: readonly unknown[] };

function capturingPool(pool: pg.Pool, captured: CapturedQuery[]): pg.Pool {
  return {
    query: (text: unknown, values?: unknown[]) => {
      if (typeof text === "string") captured.push({ text, values: values ?? [] });
      return pool.query(text as string, values);
    },
  } as unknown as pg.Pool;
}

type SequentialScans = "on" | "off";

async function planOf(
  pool: pg.Pool,
  query: CapturedQuery,
  sequentialScans: SequentialScans,
): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL enable_seqscan = ${sequentialScans}`);
    const explained = await client.query<{ "QUERY PLAN": string }>(
      `EXPLAIN ${query.text}`,
      [...query.values],
    );
    await client.query("ROLLBACK");
    return explained.rows.map((row) => row["QUERY PLAN"]).join("\n");
  } finally {
    client.release();
  }
}

async function queriesOf(read: (pool: pg.Pool) => Promise<unknown>): Promise<CapturedQuery[]> {
  const captured: CapturedQuery[] = [];
  await read(capturingPool(db.pool, captured));
  return captured;
}

async function queryContaining(
  read: (pool: pg.Pool) => Promise<unknown>,
  fragment: string,
): Promise<CapturedQuery> {
  const found = (await queriesOf(read)).find((query) => query.text.includes(fragment));
  if (found === undefined) throw new Error(`no query containing ${fragment}`);
  return found;
}

function indexConditionsOf(plan: string): string {
  return plan
    .split("\n")
    .filter((line) => line.includes("Index Cond"))
    .join("\n");
}

async function plansOf(read: (pool: pg.Pool) => Promise<unknown>): Promise<string> {
  const captured = await queriesOf(read);
  const plans = await Promise.all(captured.map((query) => planOf(db.pool, query, "off")));
  return plans.join("\n");
}

async function seedVerifiedActivity(pool: pg.Pool, sourceRowId: string): Promise<void> {
  await pool.query(
    `INSERT INTO activities
       (agent_hash, source_row_id, public_id, source_execution_id, event_index, kind, event_role, status,
        protocol, chain_family, chain_id, from_chain_id, to_chain_id,
        token_in_address, token_in_symbol, token_in_decimals,
        usd_in_priced, pricing_state, tx_hash,
        client_created_at, client_confirmed_at, block_time, statuses_seen,
        verification_state, verified_at, received_at, received_schema_version)
     VALUES ($1, $2, $2, $2, 0, 'bridge', 'bridge_deposit', 'confirmed',
             'relay', 'eip155', 8453, 8453, 42161,
             '0xaaa1', 'USDC', 6,
             10.00, 'server_priced', '0x' || $2,
             now(), now(), now(), ARRAY['confirmed'],
             'verified_full', now(), now(), 1)`,
    [agentHash, sourceRowId],
  );
}

let db: Awaited<ReturnType<typeof startTestDb>>;

const networks = registryNetworks(evmChains, solanaChains);

beforeAll(async () => {
  db = await startTestDb();
  await db.pool.query(
    `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, first_verified_at)
     VALUES ($1, 'token-sha', 1, now(), now())`,
    [agentHash],
  );
  for (let index = 0; index < 40; index += 1) {
    await seedVerifiedActivity(db.pool, `anchor-index-${index}`);
  }
  await db.pool.query("ANALYZE activities");
}, 120_000);

afterAll(async () => {
  await db.stop();
});

const ANCHOR_WINDOWED_READS: [name: string, read: (pool: pg.Pool) => Promise<unknown>][] = [
  ["the live chart buckets", (pool) => chartBuckets(pool, resolveChartRange("24h"))],
  ["the agent leaderboard", (pool) => agentLeaderboard(pool, WINDOW_SECONDS)],
  ["the protocol ranking", (pool) => protocolRanking(pool, WINDOW_SECONDS)],
  ["the priced coverage route", (pool) => pricingCoverage(pool, WINDOW_SECONDS)],
  ["the active agent count", (pool) => countActiveAgents7d(pool)],
  ["the bridge routes", (pool) => bridgeRoutes(pool, resolveChartRange("30d"), resolveBridgeChain)],
];

const networkListing = (pool: pg.Pool) =>
  networkList(pool, { networks, plan: resolveChartRange("30d"), resolveBridgeChain });

const tokenListingRead = (pool: pg.Pool) =>
  tokenListing(pool, resolveChartRange("30d"), TOKEN_ROWS_MAX);

describe("the activity time anchor is indexed", () => {
  for (const [name, read] of ANCHOR_WINDOWED_READS) {
    it(`plans ${name} on the anchor index`, async () => {
      const plans = await plansOf(read);
      const indexConditions = plans
        .split("\n")
        .filter((line) => line.includes("Index Cond"))
        .join("\n");

      expect(plans).toContain(ANCHOR_INDEX);
      expect(indexConditions).toContain(ANCHOR_EXPRESSION);
    });
  }
});

const UNPUSHABLE_WINDOWS: [name: string, read: (pool: pg.Pool) => Promise<unknown>, sql: string][] =
  [
    ["the network totals", networkListing, "chain_map(chain_family"],
    ["the token listing legs", tokenListingRead, "mode() WITHIN GROUP"],
  ];

describe("the aggregate reads whose window no index can restrict", () => {
  for (const [name, read, sql] of UNPUSHABLE_WINDOWS) {
    it(`cannot push the settlement anchor into an index condition for ${name}`, async () => {
      const plan = await planOf(db.pool, await queryContaining(read, sql), "off");

      expect(indexConditionsOf(plan)).not.toContain(ANCHOR_EXPRESSION);
    });

    it(`scans the activity table for ${name} under the planner's own settings`, async () => {
      const plan = await planOf(db.pool, await queryContaining(read, sql), "on");

      expect(plan).toContain("Seq Scan on activities");
    });
  }
});

describe("the sibling window in the same file that an index can restrict", () => {
  it("pushes the settlement anchor down for the token sparkline", async () => {
    const query = await queryContaining(tokenListingRead, "sparkline_span");
    const plan = await planOf(db.pool, query, "off");

    expect(indexConditionsOf(plan)).toContain(ANCHOR_EXPRESSION);
  });
});
