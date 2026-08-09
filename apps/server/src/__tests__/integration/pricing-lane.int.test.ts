import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { pino } from "pino";
import type { PriceFeed, PricePoint, PriceQuery } from "@agentscan/core";
import { loadConfig } from "../../config.js";
import { claimDuePricingRows } from "../../repos/activity-pricing-repo.js";
import { startTestDb } from "../../testing/pg-harness.js";
import { seedAgent } from "../../testing/seed.js";
import { runPricingPass, type PricingLoopDeps } from "../../worker/pricing-loop.js";

let db: Awaited<ReturnType<typeof startTestDb>>;
let pool: pg.Pool;

const config = loadConfig({ DATABASE_URL: "postgres://unused" });
const logger = pino({ level: "silent" });

const PRICE_HOUR = "2026-08-04T10:00:00Z";
const PRICE_HOUR_SECOND = Math.floor(Date.parse(PRICE_HOUR) / 1000);
const CONFIRMED_AT = "2026-08-04T10:41:00Z";
const AGGREGATE_DAY = "2026-08-04";
const VERIFIED_AT = "2026-08-06T09:15:00Z";
const WETH = "0x4200000000000000000000000000000000000006";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const NATIVE_SENTINEL = `0x${"E".repeat(40)}`;

const wethPoint: PricePoint = { priceUsd: "2500", confidence: 0.99, atSecond: PRICE_HOUR_SECOND };
const usdcPoint: PricePoint = { priceUsd: "1", confidence: 0.99, atSecond: PRICE_HOUR_SECOND };

type SeedPricingActivity = {
  publicId: string;
  verificationState?: string;
  pricingState?: string;
  pricingAttempts?: number;
  pricingNextAttemptAt?: string | null;
  confirmedAt?: string | null;
  tokenInAddress?: string | null;
  tokenInDecimals?: number | null;
  executedInRaw?: string | null;
  usdInEst?: string | null;
  tokenOutAddress?: string | null;
  tokenOutDecimals?: number | null;
  executedOutRaw?: string | null;
  usdOutEst?: string | null;
  chainId?: number;
  protocol?: string;
  eventRole?: string;
  blockTime?: string | null;
  verifiedAt?: string;
};

async function seedPricingActivity(options: SeedPricingActivity): Promise<bigint> {
  const agentHash = "a".repeat(64);
  await seedAgent(pool, agentHash);
  const result = await pool.query<{ id: string }>(
    `INSERT INTO activities (
       agent_hash, source_row_id, public_id, source_execution_id, event_index,
       kind, event_role, status, protocol, chain_family, chain_id, tx_hash,
       token_in_address, token_in_decimals, executed_in_raw, usd_in_est,
       token_out_address, token_out_decimals, executed_out_raw, usd_out_est,
       client_created_at, client_confirmed_at, block_time, verified_at, statuses_seen,
       verification_state, received_schema_version,
       pricing_state, pricing_attempts, pricing_next_attempt_at
     ) VALUES (
       $1, $2, $2, $2, 0,
       'swap', $18, 'confirmed', $16, 'eip155', $15, '0x' || repeat('a', 64),
       $3, $4, $5, $6::numeric,
       $7, $8, $9, $10::numeric,
       now(), $11::timestamptz, $19::timestamptz, $20::timestamptz, ARRAY['confirmed'],
       $12, 1,
       $13, $14, $17::timestamptz
     )
     RETURNING id`,
    [
      agentHash,
      options.publicId,
      options.tokenInAddress === undefined ? WETH : options.tokenInAddress,
      options.tokenInDecimals === undefined ? 18 : options.tokenInDecimals,
      options.executedInRaw === undefined ? "1000000000000000000" : options.executedInRaw,
      options.usdInEst ?? null,
      options.tokenOutAddress === undefined ? USDC : options.tokenOutAddress,
      options.tokenOutDecimals === undefined ? 6 : options.tokenOutDecimals,
      options.executedOutRaw === undefined ? "2495000000" : options.executedOutRaw,
      options.usdOutEst ?? null,
      options.confirmedAt === undefined ? CONFIRMED_AT : options.confirmedAt,
      options.verificationState ?? "verified_full",
      options.pricingState ?? "pending",
      options.pricingAttempts ?? 0,
      options.chainId ?? 8453,
      options.protocol ?? "kyberswap",
      options.pricingNextAttemptAt ?? null,
      options.eventRole ?? "swap",
      options.blockTime ?? null,
      options.verifiedAt ?? VERIFIED_AT,
    ],
  );
  return BigInt(result.rows[0]!.id);
}

async function pricedVolumeRows(): Promise<{ day: string; volume_usd_priced: string; tx_count: number }[]> {
  const result = await pool.query<{ day: string; volume_usd_priced: string; tx_count: number }>(
    "SELECT day::text AS day, volume_usd_priced, tx_count FROM daily_aggregates ORDER BY day",
  );
  return result.rows;
}

type PricingStateRow = {
  pricing_state: string;
  usd_in_priced: string | null;
  usd_out_priced: string | null;
  priced_at: Date | null;
  pricing_attempts: number;
  pricing_next_attempt_at: Date | null;
};

async function pricingStateOf(activityId: bigint): Promise<PricingStateRow> {
  const result = await pool.query<PricingStateRow>(
    `SELECT pricing_state, usd_in_priced, usd_out_priced, priced_at, pricing_attempts, pricing_next_attempt_at
     FROM activities WHERE id = $1`,
    [activityId.toString()],
  );
  return result.rows[0]!;
}

type RecordedFeed = { feed: PriceFeed; calls: readonly PriceQuery[][] };

function recordingFeed(points: Record<string, PricePoint>): RecordedFeed {
  const calls: PriceQuery[][] = [];
  return {
    calls,
    feed: {
      historical: (queries) => {
        calls.push([...queries]);
        const answered = queries.flatMap((query) => {
          const point = points[query.coinKey];
          return point === undefined ? [] : [[query.coinKey, point] as const];
        });
        return Promise.resolve(new Map(answered));
      },
    },
  };
}

function rejectingFeed(): RecordedFeed {
  const calls: PriceQuery[][] = [];
  return {
    calls,
    feed: {
      historical: (queries) => {
        calls.push([...queries]);
        return Promise.reject(new Error("price feed unreachable"));
      },
    },
  };
}

function depsWith(feed: PriceFeed, overrides: Partial<PricingLoopDeps> = {}): PricingLoopDeps {
  return {
    pool,
    config,
    logger,
    now: () => new Date(),
    priceFeed: feed,
    priceSource: "test-feed",
    ...overrides,
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

describe("claimDuePricingRows", () => {
  it("claims a verified, pending, never-attempted activity", async () => {
    const activityId = await seedPricingActivity({ publicId: "due-row" });

    const claimed = await claimDuePricingRows(pool, 10, 60);

    expect(claimed.map((row) => row.activityId)).toEqual([activityId]);
    expect(claimed[0]!.priceHour.toISOString()).toBe("2026-08-04T10:00:00.000Z");
    expect(claimed[0]!.aggregateDay).toBe(AGGREGATE_DAY);
  });

  it("anchors the hour and day buckets in UTC whatever the session timezone is", async () => {
    await seedPricingActivity({ publicId: "kathmandu-session" });
    const sessionClient = await pool.connect();
    try {
      await sessionClient.query("SET TIME ZONE 'Asia/Kathmandu'");
      const claimed = await sessionClient.query<{ price_hour: Date; aggregate_day: string }>(
        `SELECT date_trunc('hour', COALESCE(client_confirmed_at, block_time, verified_at) AT TIME ZONE 'utc')
                  AT TIME ZONE 'utc' AS price_hour,
                (COALESCE(client_confirmed_at, block_time, verified_at) AT TIME ZONE 'utc')::date::text
                  AS aggregate_day
         FROM activities`,
      );
      expect(claimed.rows[0]!.price_hour.toISOString()).toBe("2026-08-04T10:00:00.000Z");
      expect(claimed.rows[0]!.aggregate_day).toBe(AGGREGATE_DAY);
    } finally {
      sessionClient.release();
    }
  });

  it("falls back to the on-chain block time when the client sent no confirmation time", async () => {
    await seedPricingActivity({
      publicId: "block-time-anchor",
      confirmedAt: null,
      blockTime: "2026-08-05T22:30:00Z",
    });

    const claimed = await claimDuePricingRows(pool, 10, 60);

    expect(claimed[0]!.priceHour.toISOString()).toBe("2026-08-05T22:00:00.000Z");
    expect(claimed[0]!.aggregateDay).toBe("2026-08-05");
  });

  it("falls back to the verification time only when neither client nor chain time is known", async () => {
    await seedPricingActivity({ publicId: "verified-at-anchor", confirmedAt: null, blockTime: null });

    const claimed = await claimDuePricingRows(pool, 10, 60);

    expect(claimed[0]!.priceHour.toISOString()).toBe("2026-08-06T09:00:00.000Z");
    expect(claimed[0]!.aggregateDay).toBe("2026-08-06");
  });

  it("skips an activity that is not verified", async () => {
    await seedPricingActivity({ publicId: "queued-row", verificationState: "queued" });

    expect(await claimDuePricingRows(pool, 10, 60)).toEqual([]);
  });

  it("skips an activity whose verification ended in a mismatch", async () => {
    await seedPricingActivity({ publicId: "mismatch-row", verificationState: "mismatch" });

    expect(await claimDuePricingRows(pool, 10, 60)).toEqual([]);
  });

  it("skips an activity that is already priced", async () => {
    await seedPricingActivity({ publicId: "priced-row", pricingState: "server_priced" });

    expect(await claimDuePricingRows(pool, 10, 60)).toEqual([]);
  });

  it("skips an activity that is terminally unpriced", async () => {
    await seedPricingActivity({ publicId: "unpriced-row", pricingState: "unpriced" });

    expect(await claimDuePricingRows(pool, 10, 60)).toEqual([]);
  });

  it("skips an activity whose next attempt is still in the future", async () => {
    await seedPricingActivity({ publicId: "backed-off-row", pricingNextAttemptAt: "2999-01-01T00:00:00Z" });

    expect(await claimDuePricingRows(pool, 10, 60)).toEqual([]);
  });

  it("claims an activity whose next attempt has come due", async () => {
    const activityId = await seedPricingActivity({
      publicId: "due-again-row",
      pricingNextAttemptAt: "2020-01-01T00:00:00Z",
    });

    expect((await claimDuePricingRows(pool, 10, 60)).map((row) => row.activityId)).toEqual([activityId]);
  });

  it("honours the batch limit and orders by id", async () => {
    const first = await seedPricingActivity({ publicId: "batch-1" });
    await seedPricingActivity({ publicId: "batch-2" });

    expect((await claimDuePricingRows(pool, 1, 60)).map((row) => row.activityId)).toEqual([first]);
  });

  it("plans the due predicate on the partial pricing index", async () => {
    await seedPricingActivity({ publicId: "explain-row" });
    const explained = await pool.query<{ "QUERY PLAN": string }>(
      `EXPLAIN SELECT id FROM activities
       WHERE pricing_state = 'pending'
         AND verification_state IN ('verified_full','verified_basic')
         AND (pricing_next_attempt_at IS NULL OR pricing_next_attempt_at <= now())
         AND COALESCE(client_confirmed_at, block_time, verified_at) IS NOT NULL
       ORDER BY id LIMIT 50`,
    );
    const plan = explained.rows.map((row) => row["QUERY PLAN"]).join("\n");

    expect(plan).toContain("idx_activities_pricing_due");
  });

  it("does not hand the same row to two concurrent passes", async () => {
    const lockedId = await seedPricingActivity({ publicId: "locked-row" });
    const freeId = await seedPricingActivity({ publicId: "free-row" });

    const lockClient = await pool.connect();
    try {
      await lockClient.query("BEGIN");
      await lockClient.query("SELECT 1 FROM activities WHERE id = $1 FOR UPDATE", [lockedId.toString()]);

      const claimed = await claimDuePricingRows(pool, 10, 60);

      expect(claimed.map((row) => row.activityId)).toEqual([freeId]);
    } finally {
      await lockClient.query("ROLLBACK").catch(() => undefined);
      lockClient.release();
    }
  });

  it("leases a claimed row so an immediately following pass does not reclaim it", async () => {
    await seedPricingActivity({ publicId: "leased-row" });

    expect(await claimDuePricingRows(pool, 10, 60)).toHaveLength(1);
    expect(await claimDuePricingRows(pool, 10, 60)).toHaveLength(0);
  });
});

describe("runPricingPass", () => {
  it("prices both legs of a swap from the feed and records the source price", async () => {
    const activityId = await seedPricingActivity({ publicId: "two-leg" });
    const feed = recordingFeed({ [`base:${WETH.toLowerCase()}`]: wethPoint, [`base:${USDC.toLowerCase()}`]: usdcPoint });

    await runPricingPass(depsWith(feed.feed));

    const state = await pricingStateOf(activityId);
    expect(state.pricing_state).toBe("server_priced");
    expect(state.usd_in_priced).toBe("2500");
    expect(state.usd_out_priced).toBe("2495");
    expect(state.priced_at).not.toBeNull();
  });

  it("adds the IN leg to the priced daily volume under the shared UTC day key", async () => {
    await seedPricingActivity({ publicId: "volume-in" });
    const feed = recordingFeed({ [`base:${WETH.toLowerCase()}`]: wethPoint, [`base:${USDC.toLowerCase()}`]: usdcPoint });

    await runPricingPass(depsWith(feed.feed));

    expect(await pricedVolumeRows()).toEqual([
      { day: AGGREGATE_DAY, volume_usd_priced: "2500", tx_count: 0 },
    ]);
  });

  it("adds no priced volume for a role that carries none", async () => {
    await seedPricingActivity({ publicId: "volume-role", eventRole: "bridge_fill_observed" });
    const feed = recordingFeed({ [`base:${WETH.toLowerCase()}`]: wethPoint, [`base:${USDC.toLowerCase()}`]: usdcPoint });

    await runPricingPass(depsWith(feed.feed));

    expect(await pricedVolumeRows()).toEqual([{ day: AGGREGATE_DAY, volume_usd_priced: "0", tx_count: 0 }]);
  });

  it("counts an activity's priced volume once even if a lease expiry re-runs the pass over it", async () => {
    const activityId = await seedPricingActivity({ publicId: "volume-once" });
    const feed = recordingFeed({ [`base:${WETH.toLowerCase()}`]: wethPoint, [`base:${USDC.toLowerCase()}`]: usdcPoint });

    await runPricingPass(depsWith(feed.feed));
    await pool.query("UPDATE activities SET pricing_next_attempt_at = NULL WHERE id = $1", [
      activityId.toString(),
    ]);
    await runPricingPass(depsWith(feed.feed));

    expect(await pricedVolumeRows()).toEqual([
      { day: AGGREGATE_DAY, volume_usd_priced: "2500", tx_count: 0 },
    ]);
  });

  it("leaves the priced volume untouched when the pricing write is rolled back", async () => {
    await seedPricingActivity({
      publicId: "rollback-volume",
      executedInRaw: "9".repeat(200_000),
      tokenOutAddress: null,
      tokenOutDecimals: null,
      executedOutRaw: null,
    });
    const feed = recordingFeed({ [`base:${WETH.toLowerCase()}`]: wethPoint });

    await runPricingPass(depsWith(feed.feed));

    expect(await pricedVolumeRows()).toEqual([]);
  });

  it("prices the EVM native sentinel leg under the chain native coin key", async () => {
    const activityId = await seedPricingActivity({
      publicId: "native-leg",
      tokenInAddress: NATIVE_SENTINEL,
      tokenOutAddress: null,
      tokenOutDecimals: null,
      executedOutRaw: null,
    });
    const feed = recordingFeed({ [`base:0x${"0".repeat(40)}`]: wethPoint });

    await runPricingPass(depsWith(feed.feed));

    const state = await pricingStateOf(activityId);
    expect(state.pricing_state).toBe("server_priced");
    expect(state.usd_in_priced).toBe("2500");
    expect(state.usd_out_priced).toBeNull();
  });

  it("is terminally unpriced without consuming an attempt when no leg is present", async () => {
    const activityId = await seedPricingActivity({
      publicId: "no-legs",
      tokenInAddress: null,
      tokenInDecimals: null,
      executedInRaw: null,
      tokenOutAddress: null,
      tokenOutDecimals: null,
      executedOutRaw: null,
    });
    const feed = recordingFeed({});

    await runPricingPass(depsWith(feed.feed));

    const state = await pricingStateOf(activityId);
    expect(state.pricing_state).toBe("unpriced");
    expect(state.pricing_attempts).toBe(0);
    expect(feed.calls).toHaveLength(0);
  });

  it("is terminally unpriced on the first pass when the chain has no price feed key", async () => {
    const activityId = await seedPricingActivity({ publicId: "no-feed-key", chainId: 4663 });
    const feed = recordingFeed({});

    await runPricingPass(depsWith(feed.feed));

    const state = await pricingStateOf(activityId);
    expect(state.pricing_state).toBe("unpriced");
    expect(state.pricing_attempts).toBe(0);
    expect(feed.calls).toHaveLength(0);
  });

  it("is terminally unpriced on the first pass when the token address cannot be mapped to a coin", async () => {
    const activityId = await seedPricingActivity({
      publicId: "unmappable-address",
      tokenInAddress: "0xdeadbeef",
      tokenOutAddress: null,
      tokenOutDecimals: null,
      executedOutRaw: null,
    });
    const feed = recordingFeed({});

    await runPricingPass(depsWith(feed.feed));

    expect((await pricingStateOf(activityId)).pricing_state).toBe("unpriced");
    expect(feed.calls).toHaveLength(0);
  });

  it("becomes terminally unpriced once the attempt ceiling is reached", async () => {
    const activityId = await seedPricingActivity({
      publicId: "ceiling",
      pricingAttempts: config.PRICING_MAX_ATTEMPTS - 1,
      tokenOutAddress: null,
      tokenOutDecimals: null,
      executedOutRaw: null,
    });
    const feed = recordingFeed({});

    await runPricingPass(depsWith(feed.feed));

    const state = await pricingStateOf(activityId);
    expect(state.pricing_state).toBe("unpriced");
    expect(state.pricing_attempts).toBe(config.PRICING_MAX_ATTEMPTS);
  });

  it("rejects a zero price rather than publishing it as a settled figure of zero", async () => {
    const activityId = await seedPricingActivity({
      publicId: "zero-price",
      tokenOutAddress: null,
      tokenOutDecimals: null,
      executedOutRaw: null,
    });
    const feed = recordingFeed({
      [`base:${WETH.toLowerCase()}`]: { priceUsd: "0", confidence: 0.99, atSecond: PRICE_HOUR_SECOND },
    });

    await runPricingPass(depsWith(feed.feed));

    const state = await pricingStateOf(activityId);
    expect(state.pricing_state).toBe("pending");
    expect(state.usd_in_priced).toBeNull();
    expect(await pricedVolumeRows()).toEqual([]);
  });

  it("rejects a feed point below the confidence gate and caches it as a miss", async () => {
    const activityId = await seedPricingActivity({
      publicId: "low-confidence",
      tokenOutAddress: null,
      tokenOutDecimals: null,
      executedOutRaw: null,
    });
    const feed = recordingFeed({
      [`base:${WETH.toLowerCase()}`]: { priceUsd: "2500", confidence: 0.5, atSecond: PRICE_HOUR_SECOND },
    });

    await runPricingPass(depsWith(feed.feed));

    expect((await pricingStateOf(activityId)).pricing_state).toBe("pending");
    const cached = await pool.query<{ price_usd: string | null; confidence: string | null }>(
      "SELECT price_usd, confidence FROM token_prices",
    );
    expect(cached.rows).toEqual([{ price_usd: null, confidence: "0.5" }]);
  });

  it("rejects a feed point that drifted further than the gate allows", async () => {
    const activityId = await seedPricingActivity({
      publicId: "drifted",
      tokenOutAddress: null,
      tokenOutDecimals: null,
      executedOutRaw: null,
    });
    const feed = recordingFeed({
      [`base:${WETH.toLowerCase()}`]: {
        priceUsd: "2500",
        confidence: 0.99,
        atSecond: PRICE_HOUR_SECOND - config.PRICE_MAX_DRIFT_SEC - 1,
      },
    });

    await runPricingPass(depsWith(feed.feed));

    expect((await pricingStateOf(activityId)).pricing_state).toBe("pending");
    const cached = await pool.query<{ price_usd: string | null; confidence: string | null }>(
      "SELECT price_usd, confidence FROM token_prices",
    );
    expect(cached.rows).toEqual([{ price_usd: null, confidence: "0.99" }]);
  });

  it("issues exactly one upstream call for one hour bucket holding many distinct tokens", async () => {
    await seedPricingActivity({ publicId: "bucket-1" });
    await seedPricingActivity({
      publicId: "bucket-2",
      tokenInAddress: `0x${"1".repeat(40)}`,
      tokenOutAddress: `0x${"2".repeat(40)}`,
    });
    await seedPricingActivity({ publicId: "bucket-3", confirmedAt: "2026-08-04T10:59:00Z" });
    const feed = recordingFeed({});

    await runPricingPass(depsWith(feed.feed));

    expect(feed.calls).toHaveLength(1);
    expect(new Set(feed.calls[0]!.map((query) => query.coinKey))).toEqual(
      new Set([
        `base:${WETH.toLowerCase()}`,
        `base:${USDC.toLowerCase()}`,
        `base:0x${"1".repeat(40)}`,
        `base:0x${"2".repeat(40)}`,
      ]),
    );
  });

  it("issues one upstream call per hour bucket", async () => {
    await seedPricingActivity({ publicId: "hour-10" });
    await seedPricingActivity({ publicId: "hour-11", confirmedAt: "2026-08-04T11:05:00Z" });
    const feed = recordingFeed({});

    await runPricingPass(depsWith(feed.feed));

    expect(feed.calls).toHaveLength(2);
    expect(feed.calls.map((call) => call[0]!.atSecond).sort()).toEqual(
      [PRICE_HOUR_SECOND, PRICE_HOUR_SECOND + 3600].sort(),
    );
  });

  it("serves a cached hit without calling upstream at all", async () => {
    const activityId = await seedPricingActivity({
      publicId: "cache-hit",
      tokenOutAddress: null,
      tokenOutDecimals: null,
      executedOutRaw: null,
    });
    await pool.query(
      `INSERT INTO token_prices (chain_family, chain_id, token_address, price_hour, price_usd, confidence, source)
       VALUES ('eip155', 8453, $1, $2::timestamptz, 3000, 0.99, 'seed')`,
      [WETH.toLowerCase(), PRICE_HOUR],
    );
    const feed = recordingFeed({});

    await runPricingPass(depsWith(feed.feed));

    expect(feed.calls).toHaveLength(0);
    const state = await pricingStateOf(activityId);
    expect(state.pricing_state).toBe("server_priced");
    expect(state.usd_in_priced).toBe("3000");
  });

  it("does not refetch a cached miss before the retry window expires", async () => {
    const activityId = await seedPricingActivity({
      publicId: "fresh-miss",
      tokenOutAddress: null,
      tokenOutDecimals: null,
      executedOutRaw: null,
    });
    await pool.query(
      `INSERT INTO token_prices (chain_family, chain_id, token_address, price_hour, price_usd, confidence, source, fetched_at)
       VALUES ('eip155', 8453, $1, $2::timestamptz, NULL, NULL, 'seed', now() - make_interval(hours => $3::int))`,
      [WETH.toLowerCase(), PRICE_HOUR, config.PRICE_MISS_RETRY_HOURS - 1],
    );
    const feed = recordingFeed({ [`base:${WETH.toLowerCase()}`]: wethPoint });

    await runPricingPass(depsWith(feed.feed));

    expect(feed.calls).toHaveLength(0);
    expect((await pricingStateOf(activityId)).pricing_state).toBe("pending");
  });

  it("sleeps a miss-blocked row until the cached miss is refetchable, not on the transient ladder", async () => {
    const activityId = await seedPricingActivity({
      publicId: "miss-blocked-wake-up",
      tokenOutAddress: null,
      tokenOutDecimals: null,
      executedOutRaw: null,
    });
    const seeded = await pool.query<{ refetchable_at: Date }>(
      `INSERT INTO token_prices (chain_family, chain_id, token_address, price_hour, price_usd, confidence, source, fetched_at)
       VALUES ('eip155', 8453, $1, $2::timestamptz, NULL, NULL, 'seed', now() - make_interval(hours => $3::int))
       RETURNING fetched_at + make_interval(hours => $4::int) AS refetchable_at`,
      [WETH.toLowerCase(), PRICE_HOUR, config.PRICE_MISS_RETRY_HOURS - 1, config.PRICE_MISS_RETRY_HOURS],
    );
    const refetchableAt = seeded.rows[0]!.refetchable_at;

    await runPricingPass(depsWith(recordingFeed({}).feed));

    const state = await pricingStateOf(activityId);
    expect(state.pricing_state).toBe("pending");
    expect(state.pricing_attempts).toBe(1);
    expect(state.pricing_next_attempt_at!.getTime()).toBeGreaterThanOrEqual(refetchableAt.getTime() - 60_000);
  });

  it("keeps the short transient ladder when the feed is unavailable rather than cache-blocked", async () => {
    const activityId = await seedPricingActivity({
      publicId: "transient-ladder",
      tokenOutAddress: null,
      tokenOutDecimals: null,
      executedOutRaw: null,
    });
    const before = Date.now();

    await runPricingPass(depsWith(rejectingFeed().feed));

    const state = await pricingStateOf(activityId);
    expect(state.pricing_attempts).toBe(1);
    expect(state.pricing_next_attempt_at!.getTime() - before).toBeLessThan(10 * 60_000);
  });

  it("refetches a cached miss once the retry window has passed", async () => {
    const activityId = await seedPricingActivity({
      publicId: "stale-miss",
      tokenOutAddress: null,
      tokenOutDecimals: null,
      executedOutRaw: null,
    });
    await pool.query(
      `INSERT INTO token_prices (chain_family, chain_id, token_address, price_hour, price_usd, confidence, source, fetched_at)
       VALUES ('eip155', 8453, $1, $2::timestamptz, NULL, NULL, 'seed', now() - make_interval(hours => $3::int))`,
      [WETH.toLowerCase(), PRICE_HOUR, config.PRICE_MISS_RETRY_HOURS + 1],
    );
    const feed = recordingFeed({ [`base:${WETH.toLowerCase()}`]: wethPoint });

    await runPricingPass(depsWith(feed.feed));

    expect(feed.calls).toHaveLength(1);
    const state = await pricingStateOf(activityId);
    expect(state.pricing_state).toBe("server_priced");
    expect(state.usd_in_priced).toBe("2500");
  });

  it("never overwrites a cached hit with a later miss", async () => {
    await seedPricingActivity({
      publicId: "permanent-hit",
      tokenOutAddress: null,
      tokenOutDecimals: null,
      executedOutRaw: null,
    });
    await pool.query(
      `INSERT INTO token_prices (chain_family, chain_id, token_address, price_hour, price_usd, confidence, source)
       VALUES ('eip155', 8453, $1, $2::timestamptz, 3000, 0.99, 'seed')`,
      [WETH.toLowerCase(), PRICE_HOUR],
    );

    await runPricingPass(depsWith(recordingFeed({}).feed));

    const cached = await pool.query<{ price_usd: string }>("SELECT price_usd FROM token_prices");
    expect(cached.rows).toEqual([{ price_usd: "3000" }]);
  });

  it("contains a row whose write throws and still completes the rest of the pass", async () => {
    const contained: string[] = [];
    const poisoned = await seedPricingActivity({
      publicId: "poisoned",
      executedInRaw: "9".repeat(200_000),
      tokenOutAddress: null,
      tokenOutDecimals: null,
      executedOutRaw: null,
    });
    const healthy = await seedPricingActivity({ publicId: "healthy" });
    const feed = recordingFeed({ [`base:${WETH.toLowerCase()}`]: wethPoint, [`base:${USDC.toLowerCase()}`]: usdcPoint });
    const capturingLogger = {
      ...logger,
      warn: (_payload: unknown, message: string) => contained.push(message),
    } as unknown as PricingLoopDeps["logger"];

    await runPricingPass(depsWith(feed.feed, { logger: capturingLogger }));

    expect(contained).toEqual(["pricing a single activity threw; containing it to that row"]);
    const poisonedState = await pricingStateOf(poisoned);
    expect(poisonedState.pricing_state).toBe("pending");
    expect(poisonedState.pricing_attempts).toBe(1);
    expect(poisonedState.pricing_next_attempt_at).not.toBeNull();
    expect((await pricingStateOf(healthy)).pricing_state).toBe("server_priced");
  });

  it("reschedules every row and caches nothing when the feed rejects", async () => {
    const activityId = await seedPricingActivity({ publicId: "feed-down" });
    const feed = rejectingFeed();

    await expect(runPricingPass(depsWith(feed.feed))).resolves.toBe(1);

    const state = await pricingStateOf(activityId);
    expect(state.pricing_state).toBe("pending");
    expect(state.pricing_attempts).toBe(1);
    expect(state.pricing_next_attempt_at).not.toBeNull();
    expect((await pool.query("SELECT 1 FROM token_prices")).rowCount).toBe(0);
  });

  it("warns on a divergent client estimate without altering the price it writes", async () => {
    const warnings: Record<string, unknown>[] = [];
    const activityId = await seedPricingActivity({
      publicId: "divergent",
      usdInEst: "100",
      tokenOutAddress: null,
      tokenOutDecimals: null,
      executedOutRaw: null,
    });
    const feed = recordingFeed({ [`base:${WETH.toLowerCase()}`]: wethPoint });
    const capturingLogger = {
      ...logger,
      warn: (payload: Record<string, unknown>, message: string) => {
        if (message === "pricing divergence") warnings.push(payload);
      },
    } as unknown as PricingLoopDeps["logger"];

    await runPricingPass(depsWith(feed.feed, { logger: capturingLogger }));

    expect((await pricingStateOf(activityId)).usd_in_priced).toBe("2500");
    expect(warnings).toEqual([
      {
        activityId: activityId.toString(),
        chainSlug: "base",
        chainFamily: "eip155",
        chainId: "8453",
        protocol: "kyberswap",
        leg: "in",
        tokenAddress: WETH,
        pricedUsd: "2500",
        estimateUsd: "100",
        ratio: 25,
      },
    ]);
  });

  it("stays silent about divergence when the client sent no estimate", async () => {
    const warnings: string[] = [];
    await seedPricingActivity({ publicId: "no-estimate" });
    const feed = recordingFeed({ [`base:${WETH.toLowerCase()}`]: wethPoint, [`base:${USDC.toLowerCase()}`]: usdcPoint });
    const capturingLogger = {
      ...logger,
      warn: (_payload: unknown, message: string) => warnings.push(message),
    } as unknown as PricingLoopDeps["logger"];

    await runPricingPass(depsWith(feed.feed, { logger: capturingLogger }));

    expect(warnings).toEqual([]);
  });

  it("logs pass coverage broken down by chain and protocol", async () => {
    const coverage: Record<string, unknown>[] = [];
    await seedPricingActivity({ publicId: "covered-priced" });
    await seedPricingActivity({
      publicId: "covered-legless",
      protocol: "relay",
      tokenInAddress: null,
      tokenInDecimals: null,
      executedInRaw: null,
      tokenOutAddress: null,
      tokenOutDecimals: null,
      executedOutRaw: null,
    });
    const feed = recordingFeed({ [`base:${WETH.toLowerCase()}`]: wethPoint, [`base:${USDC.toLowerCase()}`]: usdcPoint });
    const capturingLogger = {
      ...logger,
      info: (payload: Record<string, unknown>, message: string) => {
        if (message === "pricing coverage") coverage.push(payload);
      },
    } as unknown as PricingLoopDeps["logger"];

    await runPricingPass(depsWith(feed.feed, { logger: capturingLogger }));

    expect(coverage).toEqual([
      {
        processed: 2,
        serverPriced: 1,
        unpriceable: 0,
        nothingToPrice: 1,
        rescheduled: 0,
        byChainProtocol: [
          {
            chainSlug: "base",
            chainFamily: "eip155",
            chainId: "8453",
            protocol: "kyberswap",
            serverPriced: 1,
            unpriceable: 0,
            nothingToPrice: 0,
          },
          {
            chainSlug: "base",
            chainFamily: "eip155",
            chainId: "8453",
            protocol: "relay",
            serverPriced: 0,
            unpriceable: 0,
            nothingToPrice: 1,
          },
        ],
      },
    ]);
  });

  it("keeps a legless activity out of the coverage ratio and counts a feed failure in it", async () => {
    const coverage: Record<string, unknown>[] = [];
    await seedPricingActivity({ publicId: "ratio-priced" });
    await seedPricingActivity({
      publicId: "ratio-legless",
      tokenInAddress: null,
      tokenInDecimals: null,
      executedInRaw: null,
      tokenOutAddress: null,
      tokenOutDecimals: null,
      executedOutRaw: null,
    });
    await seedPricingActivity({ publicId: "ratio-unmappable", chainId: 4663 });
    const feed = recordingFeed({ [`base:${WETH.toLowerCase()}`]: wethPoint, [`base:${USDC.toLowerCase()}`]: usdcPoint });
    const capturingLogger = {
      ...logger,
      info: (payload: Record<string, unknown>, message: string) => {
        if (message === "pricing coverage") coverage.push(payload);
      },
    } as unknown as PricingLoopDeps["logger"];

    await runPricingPass(depsWith(feed.feed, { logger: capturingLogger }));

    expect(coverage[0]).toMatchObject({
      processed: 3,
      serverPriced: 1,
      unpriceable: 1,
      nothingToPrice: 1,
      rescheduled: 0,
    });
  });
});
