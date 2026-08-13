import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { pino } from "pino";
import type { PriceFeed, PricePoint } from "@agentscan/core";
import { requeueUnpricedActivities } from "../../cli/pricing-requeue.js";
import { loadConfig } from "../../config.js";
import { startTestDb } from "../../testing/pg-harness.js";
import { seedAgent } from "../../testing/seed.js";
import { runPricingPass, type PricingLoopDeps } from "../../worker/pricing-loop.js";

let db: Awaited<ReturnType<typeof startTestDb>>;
let pool: pg.Pool;

const config = loadConfig({ DATABASE_URL: "postgres://unused" });
const logger = pino({ level: "silent" });

const CONFIRMED_AT = "2026-08-04T10:41:00Z";
const AGGREGATE_DAY = "2026-08-04";
const PRICE_HOUR_SECOND = Math.floor(Date.parse("2026-08-04T10:00:00Z") / 1000);
const WETH = "0x4200000000000000000000000000000000000006";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const wethPoint: PricePoint = { priceUsd: "2500", confidence: 0.99, atSecond: PRICE_HOUR_SECOND };
const usdcPoint: PricePoint = { priceUsd: "1", confidence: 0.99, atSecond: PRICE_HOUR_SECOND };

type SeedActivityOptions = {
  publicId: string;
  pricingState: "pending" | "server_priced" | "unpriced";
  pricingAttempts?: number;
  pricingNextAttemptAt?: string | null;
  usdInPriced?: string | null;
  chainId?: number;
};

async function seedActivity(options: SeedActivityOptions): Promise<bigint> {
  const agentHash = "a".repeat(64);
  await seedAgent(pool, agentHash);
  const result = await pool.query<{ id: string }>(
    `INSERT INTO activities (
       agent_hash, source_row_id, public_id, source_execution_id, event_index,
       kind, event_role, status, protocol, chain_family, chain_id, tx_hash,
       token_in_address, token_in_decimals, executed_in_raw,
       token_out_address, token_out_decimals, executed_out_raw,
       client_created_at, client_confirmed_at, statuses_seen,
       verification_state, received_schema_version,
       pricing_state, pricing_attempts, pricing_next_attempt_at, usd_in_priced
     ) VALUES (
       $1, $2, $2, $2, 0,
       'swap', 'swap', 'confirmed', 'kyberswap', 'eip155', $3, '0x' || repeat('a', 64),
       $4, 18, '1000000000000000000',
       $5, 6, '2495000000',
       now(), $6::timestamptz, ARRAY['confirmed'],
       'verified_full', 1,
       $7, $8, $9::timestamptz, $10::numeric
     )
     RETURNING id`,
    [
      agentHash,
      options.publicId,
      options.chainId ?? 8453,
      WETH,
      USDC,
      CONFIRMED_AT,
      options.pricingState,
      options.pricingAttempts ?? 0,
      options.pricingNextAttemptAt ?? null,
      options.usdInPriced ?? null,
    ],
  );
  return BigInt(result.rows[0]!.id);
}

type PricingStateRow = {
  pricing_state: string;
  pricing_attempts: number;
  next_attempt_due: boolean | null;
  usd_in_priced: string | null;
};

async function pricingStateOf(activityId: bigint): Promise<PricingStateRow> {
  const result = await pool.query<PricingStateRow>(
    `SELECT pricing_state, pricing_attempts, (pricing_next_attempt_at <= now()) AS next_attempt_due, usd_in_priced
     FROM activities WHERE id = $1`,
    [activityId.toString()],
  );
  return result.rows[0]!;
}

async function pricedVolumeRows(): Promise<{ day: string; volume_usd_priced: string }[]> {
  const result = await pool.query<{ day: string; volume_usd_priced: string }>(
    "SELECT day::text AS day, volume_usd_priced FROM daily_aggregates ORDER BY day",
  );
  return result.rows;
}

function answeringFeed(): PriceFeed {
  const points: Record<string, PricePoint> = {
    [`base:${WETH.toLowerCase()}`]: wethPoint,
    [`base:${USDC.toLowerCase()}`]: usdcPoint,
  };
  return {
    historical: (queries) => {
      const answered = queries.flatMap((query) => {
        const point = points[query.coinKey];
        return point === undefined ? [] : [[query.coinKey, point] as const];
      });
      return Promise.resolve(new Map(answered));
    },
  };
}

function pricingDeps(): PricingLoopDeps {
  return {
    pool,
    config,
    logger,
    now: () => new Date(),
    priceFeed: answeringFeed(),
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
  await pool.query("DELETE FROM activities");
  await pool.query("DELETE FROM token_prices");
  await pool.query("DELETE FROM daily_aggregates");
});

describe("pricing requeue", () => {
  it("re-opens only terminally unpriced activities with a fresh retry budget", async () => {
    const unpricedId = await seedActivity({ publicId: "was-unpriced", pricingState: "unpriced", pricingAttempts: 5 });
    const pricedId = await seedActivity({
      publicId: "stays-priced",
      pricingState: "server_priced",
      usdInPriced: "2500",
    });
    const pendingId = await seedActivity({
      publicId: "stays-pending",
      pricingState: "pending",
      pricingAttempts: 2,
      pricingNextAttemptAt: "2999-01-01T00:00:00Z",
    });

    const outcome = await requeueUnpricedActivities(pool);

    expect(outcome).toEqual({ requeuedCount: 1 });
    expect(await pricingStateOf(unpricedId)).toEqual({
      pricing_state: "pending",
      pricing_attempts: 0,
      next_attempt_due: true,
      usd_in_priced: null,
    });
    expect(await pricingStateOf(pricedId)).toEqual({
      pricing_state: "server_priced",
      pricing_attempts: 0,
      next_attempt_due: null,
      usd_in_priced: "2500",
    });
    expect(await pricingStateOf(pendingId)).toEqual({
      pricing_state: "pending",
      pricing_attempts: 2,
      next_attempt_due: false,
      usd_in_priced: null,
    });
  });

  it("writes nothing to daily aggregates itself and lets the pricing lane book the volume exactly once", async () => {
    const activityId = await seedActivity({ publicId: "repriced", pricingState: "unpriced", pricingAttempts: 3 });

    await requeueUnpricedActivities(pool);

    expect(await pricedVolumeRows()).toEqual([]);

    await runPricingPass(pricingDeps());

    expect(await pricingStateOf(activityId)).toEqual({
      pricing_state: "server_priced",
      pricing_attempts: 0,
      next_attempt_due: null,
      usd_in_priced: "2500",
    });
    expect(await pricedVolumeRows()).toEqual([{ day: AGGREGATE_DAY, volume_usd_priced: "2500" }]);

    expect(await requeueUnpricedActivities(pool)).toEqual({ requeuedCount: 0 });
    expect(await runPricingPass(pricingDeps())).toBe(0);
    expect(await pricedVolumeRows()).toEqual([{ day: AGGREGATE_DAY, volume_usd_priced: "2500" }]);
  });

  it("narrows the requeue to one chain when a chain id is given", async () => {
    const matchingId = await seedActivity({
      publicId: "on-target-chain",
      pricingState: "unpriced",
      pricingAttempts: 4,
      chainId: 4663,
    });
    const otherChainId = await seedActivity({
      publicId: "on-other-chain",
      pricingState: "unpriced",
      pricingAttempts: 4,
    });

    const outcome = await requeueUnpricedActivities(pool, 4663n);

    expect(outcome).toEqual({ requeuedCount: 1 });
    expect(await pricingStateOf(matchingId)).toEqual({
      pricing_state: "pending",
      pricing_attempts: 0,
      next_attempt_due: true,
      usd_in_priced: null,
    });
    expect(await pricingStateOf(otherChainId)).toEqual({
      pricing_state: "unpriced",
      pricing_attempts: 4,
      next_attempt_due: null,
      usd_in_priced: null,
    });
  });
});
