import type pg from "pg";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveChain, resolveChartRange } from "@agentscan/core";
import { loadConfig } from "../../config.js";
import { activityAggregateDaySql } from "../../repos/activity-time-anchor.js";
import { chartBuckets, type ChartBucketRead } from "../../repos/read-repo.js";
import { startTestDb } from "../../testing/pg-harness.js";
import { makeChainReader } from "../../verification/viem-chain-reader.js";
import { runVerificationPass } from "../../worker/loop.js";

const agentHash = "c".repeat(64);

const confirmAllConfig = loadConfig({
  DATABASE_URL: "postgres://unused-in-tests",
  VERIFY_FAKE_MODE: "confirm_all",
});

const logger = pino({ level: "silent" });

type ActivitySeed = {
  protocol: string;
  kind: "swap" | "bridge";
  eventRole: "swap" | "bridge_deposit" | "bridge_fill_observed";
  usdInPriced: string;
  fractionOfElapsedDay: number;
};

const SEEDS: ActivitySeed[] = [
  { protocol: "kyberswap", kind: "swap", eventRole: "swap", usdInPriced: "1234.56", fractionOfElapsedDay: 0.1 },
  { protocol: "relay", kind: "bridge", eventRole: "bridge_deposit", usdInPriced: "87.30", fractionOfElapsedDay: 0.4 },
  { protocol: "relay", kind: "bridge", eventRole: "bridge_fill_observed", usdInPriced: "86.90", fractionOfElapsedDay: 0.7 },
  { protocol: "kyberswap", kind: "swap", eventRole: "swap", usdInPriced: "0.01", fractionOfElapsedDay: 0.9 },
];

const EXPECTED_TODAY_VOLUME_USD = "1321.87";
const EXPECTED_TODAY_TX_COUNT = 4;

const USD_SCALE = 18n;

function scaledUsd(decimal: string): bigint {
  const [whole = "0", fraction = ""] = decimal.split(".");
  return BigInt(whole) * 10n ** USD_SCALE + BigInt(fraction.padEnd(Number(USD_SCALE), "0"));
}

function totalScaledUsd(buckets: ChartBucketRead[]): bigint {
  return buckets.reduce((total, bucket) => total + scaledUsd(bucket.volumeUsd), 0n);
}

function totalTxCount(buckets: ChartBucketRead[]): number {
  return buckets.reduce((total, bucket) => total + bucket.txCount, 0);
}

function onlyRow<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error("expected exactly one row");
  return row;
}

function bucketAt(buckets: ChartBucketRead[], bucketStart: number): ChartBucketRead {
  const bucket = buckets.find((candidate) => candidate.bucketStart === bucketStart);
  if (bucket === undefined) throw new Error(`no bucket starting at ${bucketStart}`);
  return bucket;
}

async function utcDayWindow(pool: pg.Pool): Promise<{ dayStart: Date; elapsedMs: number }> {
  const result = await pool.query<{ day_start: Date; server_now: Date }>(
    `SELECT date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc' AS day_start, now() AS server_now`,
  );
  const row = onlyRow(result.rows);
  return { dayStart: row.day_start, elapsedMs: row.server_now.getTime() - row.day_start.getTime() };
}

async function addPricedVolumeAsTheLaneWould(pool: pg.Pool): Promise<void> {
  await pool.query(
    `INSERT INTO daily_aggregates (day, protocol, kind, volume_usd, tx_count, volume_usd_priced)
     SELECT ${activityAggregateDaySql("a")}, a.protocol, a.kind, 0, 0,
            COALESCE(SUM(a.usd_in_priced) FILTER (
              WHERE a.pricing_state = 'server_priced'
                AND a.event_role IN ('swap','bridge_deposit')
            ), 0)
     FROM activities a
     WHERE a.verification_state IN ('verified_full','verified_basic')
     GROUP BY 1, a.protocol, a.kind
     ON CONFLICT (day, protocol, kind)
     DO UPDATE SET volume_usd_priced = daily_aggregates.volume_usd_priced + EXCLUDED.volume_usd_priced`,
  );
}

async function seedQueuedActivity(pool: pg.Pool, index: number, seed: ActivitySeed, confirmedAt: Date): Promise<void> {
  const rowKey = `chart-sum-${index}`;
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO activities
       (agent_hash, source_row_id, public_id, source_execution_id, event_index, kind, event_role, status,
        protocol, chain_family, chain_id, usd_in_priced, pricing_state, tx_hash,
        client_created_at, client_confirmed_at, statuses_seen, verification_state, received_schema_version)
     VALUES ($1, $2, $2, $2, 0, $3, $4, 'confirmed', $5, 'eip155', 8453, $6::numeric, 'server_priced', $7,
             $8, $8, ARRAY['pending','confirmed'], 'queued', 1)
     RETURNING id`,
    [agentHash, rowKey, seed.kind, seed.eventRole, seed.protocol, seed.usdInPriced, `0xtx-${index}`, confirmedAt],
  );
  await pool.query(
    `INSERT INTO verification_jobs (activity_id, attempts, first_attempt_at, next_attempt_at)
     VALUES ($1, 0, now(), now() - interval '1 second')`,
    [onlyRow(inserted.rows).id],
  );
}

let db: Awaited<ReturnType<typeof startTestDb>>;
let dayStartSeconds: number;

beforeAll(async () => {
  db = await startTestDb();
  await db.pool.query(
    `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at)
     VALUES ($1, 'token-sha', 1, now())`,
    [agentHash],
  );
  const { dayStart, elapsedMs } = await utcDayWindow(db.pool);
  dayStartSeconds = dayStart.getTime() / 1000;
  for (const [index, seed] of SEEDS.entries()) {
    const confirmedAt = new Date(dayStart.getTime() + Math.floor(elapsedMs * seed.fractionOfElapsedDay));
    await seedQueuedActivity(db.pool, index, seed, confirmedAt);
  }
  await runVerificationPass({
    pool: db.pool,
    config: confirmAllConfig,
    now: () => new Date(),
    resolveChain,
    chainReaderFor: (entry, context) => makeChainReader(entry, confirmAllConfig, context),
    logger,
  });
  await addPricedVolumeAsTheLaneWould(db.pool);
}, 120_000);

afterAll(async () => {
  await db.stop();
});

describe("chart ranges served from activities and from the priced daily aggregates", () => {
  it("reports the same volume for today whether it is bucketed live or read from the aggregates", async () => {
    const liveBuckets = await chartBuckets(db.pool, resolveChartRange("24h"));
    const aggregateBuckets = await chartBuckets(db.pool, resolveChartRange("30d"));

    const liveToday = liveBuckets.filter((bucket) => bucket.bucketStart >= dayStartSeconds);
    const aggregatedToday = bucketAt(aggregateBuckets, dayStartSeconds);

    expect({
      live: totalScaledUsd(liveToday),
      aggregated: scaledUsd(aggregatedToday.volumeUsd),
    }).toEqual({
      live: scaledUsd(EXPECTED_TODAY_VOLUME_USD),
      aggregated: scaledUsd(EXPECTED_TODAY_VOLUME_USD),
    });
  });

  it("reports the same transaction count for today whether it is bucketed live or read from the aggregates", async () => {
    const liveBuckets = await chartBuckets(db.pool, resolveChartRange("24h"));
    const aggregateBuckets = await chartBuckets(db.pool, resolveChartRange("30d"));

    const liveToday = liveBuckets.filter((bucket) => bucket.bucketStart >= dayStartSeconds);
    const aggregatedToday = bucketAt(aggregateBuckets, dayStartSeconds);

    expect({
      live: totalTxCount(liveToday),
      aggregated: aggregatedToday.txCount,
    }).toEqual({
      live: EXPECTED_TODAY_TX_COUNT,
      aggregated: EXPECTED_TODAY_TX_COUNT,
    });
  });
});
