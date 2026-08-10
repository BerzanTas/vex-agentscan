import { pino } from "pino";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  resolveChain,
  type ChainReader,
  type PriceFeed,
  type PricePoint,
  type ReceiptView,
} from "@agentscan/core";
import { loadConfig } from "../../config.js";
import { startTestDb } from "../../testing/pg-harness.js";
import { runVerificationPass, type VerificationLoopDeps } from "../../worker/loop.js";
import { runPricingPass, type PricingLoopDeps } from "../../worker/pricing-loop.js";

const AGENT = "b".repeat(64);
const PROTOCOL = "vex-lane";
const CONFIRMED_AT = new Date("2026-08-04T10:41:00.000Z");
const AGGREGATE_DAY = "2026-08-04";
const PRICE_HOUR_SECOND = Math.floor(Date.parse("2026-08-04T10:00:00.000Z") / 1000);
const CLIENT_ESTIMATE_USD = "10.25";
const WETH = "0x4200000000000000000000000000000000000006";
const ONE_WETH_RAW = "1000000000000000000";
const SERVER_PRICED_WETH_USD = "2500";

const config = loadConfig({ DATABASE_URL: "postgres://unused-in-tests" });
const logger = pino({ level: "silent" });

let db: Awaited<ReturnType<typeof startTestDb>>;
let pool: pg.Pool;
let seedCounter = 0;

type RoleCase = { kind: string; eventRole: string };

const capitalDeployingCases: RoleCase[] = [
  { kind: "swap", eventRole: "swap" },
  { kind: "bridge", eventRole: "bridge_deposit" },
  { kind: "lend", eventRole: "lend_deposit" },
  { kind: "prediction", eventRole: "predict_buy" },
];

const casesOutsideVolume: RoleCase[] = [
  { kind: "swap", eventRole: "swap_fee" },
  { kind: "swap", eventRole: "trench_fee" },
  { kind: "bridge", eventRole: "bridge_fee" },
  { kind: "bridge", eventRole: "bridge_fill_expected" },
  { kind: "bridge", eventRole: "bridge_fill_observed" },
  { kind: "bridge", eventRole: "bridge_refund" },
  { kind: "lend", eventRole: "lend_withdraw" },
  { kind: "lend", eventRole: "lend_borrow_operate" },
  { kind: "prediction", eventRole: "predict_sell" },
  { kind: "prediction", eventRole: "predict_claim" },
  { kind: "prediction", eventRole: "predict_close" },
  { kind: "wrap", eventRole: "wrap" },
  { kind: "wrap", eventRole: "unwrap" },
  { kind: "yield", eventRole: "yield_pt" },
  { kind: "yield", eventRole: "yield_yt" },
  { kind: "yield", eventRole: "yield_py" },
  { kind: "yield", eventRole: "yield_lp" },
  { kind: "yield", eventRole: "yield_sy" },
  { kind: "yield", eventRole: "yield_claim" },
  { kind: "launch", eventRole: "token_launch" },
];

async function seedAgent(): Promise<void> {
  await pool.query(
    `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at)
     VALUES ($1, 'sha', 1, now()) ON CONFLICT (agent_hash) DO NOTHING`,
    [AGENT],
  );
}

async function seedQueuedActivity(roleCase: RoleCase): Promise<void> {
  await seedAgent();
  seedCounter += 1;
  const rowKey = `volume-role-${seedCounter}`;
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO activities
       (agent_hash, source_row_id, public_id, source_execution_id, event_index, kind, event_role, status,
        protocol, chain_family, chain_id, usd_in_est, tx_hash,
        client_created_at, client_confirmed_at, statuses_seen, verification_state, received_schema_version)
     VALUES ($1, $2, $2, $2, 0, $3, $4, 'confirmed',
             $5, 'eip155', 8453, $6::numeric, '0x' || $2,
             now() - interval '1 hour', $7::timestamptz, ARRAY['confirmed'], 'queued', 1)
     RETURNING id`,
    [AGENT, rowKey, roleCase.kind, roleCase.eventRole, PROTOCOL, CLIENT_ESTIMATE_USD, CONFIRMED_AT.toISOString()],
  );
  await pool.query(
    `INSERT INTO verification_jobs (activity_id, attempts, first_attempt_at, next_attempt_at)
     VALUES ($1, 0, now(), now() - interval '1 second')`,
    [inserted.rows[0]!.id],
  );
}

async function seedVerifiedAwaitingAPrice(roleCase: RoleCase): Promise<void> {
  await seedAgent();
  seedCounter += 1;
  const rowKey = `volume-role-pricing-${seedCounter}`;
  await pool.query(
    `INSERT INTO activities
       (agent_hash, source_row_id, public_id, source_execution_id, event_index, kind, event_role, status,
        protocol, chain_family, chain_id, tx_hash,
        token_in_address, token_in_decimals, executed_in_raw,
        client_created_at, client_confirmed_at, verified_at, statuses_seen,
        verification_state, received_schema_version, pricing_state)
     VALUES ($1, $2, $2, $2, 0, $3, $4, 'confirmed',
             $5, 'eip155', 8453, '0x' || $2,
             $6, 18, $7,
             now() - interval '1 hour', $8::timestamptz, now(), ARRAY['confirmed'],
             'verified_full', 1, 'pending')`,
    [AGENT, rowKey, roleCase.kind, roleCase.eventRole, PROTOCOL, WETH, ONE_WETH_RAW, CONFIRMED_AT.toISOString()],
  );
}

type AggregateRow = { day: string; kind: string; volume_usd: string; tx_count: number };

async function aggregateOf(kind: string): Promise<AggregateRow> {
  const result = await pool.query<AggregateRow>(
    `SELECT day::text AS day, kind, volume_usd::text AS volume_usd, tx_count
     FROM daily_aggregates WHERE protocol = $1 AND kind = $2`,
    [PROTOCOL, kind],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error(`no daily aggregate was booked for kind ${kind}`);
  return row;
}

async function pricedVolumeOf(kind: string): Promise<string> {
  const result = await pool.query<{ volume_usd_priced: string }>(
    `SELECT volume_usd_priced::text AS volume_usd_priced
     FROM daily_aggregates WHERE protocol = $1 AND kind = $2`,
    [PROTOCOL, kind],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error(`no daily aggregate was booked for kind ${kind}`);
  return row.volume_usd_priced;
}

async function usdInPricedOf(eventRole: string): Promise<string | null> {
  const result = await pool.query<{ usd_in_priced: string | null; pricing_state: string }>(
    "SELECT usd_in_priced::text AS usd_in_priced, pricing_state FROM activities WHERE event_role = $1",
    [eventRole],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error(`no activity was seeded for role ${eventRole}`);
  expect(row.pricing_state).toBe("server_priced");
  return row.usd_in_priced;
}

const successReceipt: ReceiptView = {
  status: "success",
  blockTimestamp: CONFIRMED_AT,
  erc20Transfers: [],
};

const readerReturning = (receipt: ReceiptView): ChainReader => ({
  getReceipt: () => Promise.resolve(receipt),
});

function verificationDeps(): VerificationLoopDeps {
  return {
    pool,
    config,
    now: () => new Date(),
    resolveChain,
    chainReaderFor: () => readerReturning(successReceipt),
    logger,
  };
}

const wethPoint: PricePoint = {
  priceUsd: SERVER_PRICED_WETH_USD,
  confidence: 0.99,
  atSecond: PRICE_HOUR_SECOND,
};

const wethPricingFeed: PriceFeed = {
  historical: (queries) =>
    Promise.resolve(new Map(queries.map((query) => [query.coinKey, wethPoint] as const))),
};

function pricingDeps(): PricingLoopDeps {
  return {
    pool,
    config,
    logger,
    now: () => new Date(),
    priceFeed: wethPricingFeed,
    priceSource: "test-feed",
  };
}

beforeAll(async () => {
  db = await startTestDb();
  pool = db.pool;
}, 120_000);

afterAll(async () => {
  await db.stop();
});

beforeEach(async () => {
  await pool.query("DELETE FROM verification_jobs");
  await pool.query("DELETE FROM activities");
  await pool.query("DELETE FROM token_prices");
  await pool.query("DELETE FROM daily_aggregates");
});

describe("the daily aggregate a verified row books", () => {
  it.each(capitalDeployingCases)(
    "books the spent estimate of a verified $eventRole as volume",
    async (roleCase) => {
      await seedQueuedActivity(roleCase);

      await runVerificationPass(verificationDeps());

      expect(await aggregateOf(roleCase.kind)).toEqual({
        day: AGGREGATE_DAY,
        kind: roleCase.kind,
        volume_usd: CLIENT_ESTIMATE_USD,
        tx_count: 1,
      });
    },
  );

  it.each(casesOutsideVolume)(
    "counts a verified $eventRole as a transaction carrying no volume",
    async (roleCase) => {
      await seedQueuedActivity(roleCase);

      await runVerificationPass(verificationDeps());

      expect(await aggregateOf(roleCase.kind)).toEqual({
        day: AGGREGATE_DAY,
        kind: roleCase.kind,
        volume_usd: "0",
        tx_count: 1,
      });
    },
  );
});

describe("the priced volume the pricing lane books", () => {
  it("adds a newly included role's server priced spend to the priced volume", async () => {
    await seedVerifiedAwaitingAPrice({ kind: "lend", eventRole: "lend_deposit" });

    await runPricingPass(pricingDeps());

    expect(await usdInPricedOf("lend_deposit")).toBe(SERVER_PRICED_WETH_USD);
    expect(await pricedVolumeOf("lend")).toBe(SERVER_PRICED_WETH_USD);
  });

  it("prices an excluded role's legs without adding them to the priced volume", async () => {
    await seedVerifiedAwaitingAPrice({ kind: "lend", eventRole: "lend_withdraw" });

    await runPricingPass(pricingDeps());

    expect(await usdInPricedOf("lend_withdraw")).toBe(SERVER_PRICED_WETH_USD);
    expect(await pricedVolumeOf("lend")).toBe("0");
  });
});
