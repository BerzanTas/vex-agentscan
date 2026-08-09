import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveChartRange } from "@agentscan/core";
import { chartBuckets } from "../../repos/read-repo.js";
import { startTestDb } from "../../testing/pg-harness.js";

const agentHash = "d".repeat(64);

async function seedVerifiedActivity(
  pool: pg.Pool,
  sourceRowId: string,
  eventRole: string,
  usdInPriced: string,
  minutesAgo: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO activities
       (agent_hash, source_row_id, public_id, source_execution_id, event_index, kind, event_role, status,
        protocol, chain_family, chain_id, amount_in_raw, usd_in_priced, pricing_state, tx_hash,
        client_created_at, client_confirmed_at, statuses_seen, verification_state, verified_at,
        received_at, received_schema_version)
     VALUES ($1, $2, $2, 'exec-1', 0, 'swap', $3, 'confirmed',
             'kyberswap', 'eip155', 8453, '1000000000000000000', $4::numeric, 'server_priced', '0xabc',
             now() - make_interval(mins => $5::int), now() - make_interval(mins => $5::int),
             ARRAY['confirmed'], 'verified_full', now(), now(), 1)`,
    [agentHash, sourceRowId, eventRole, usdInPriced, minutesAgo],
  );
}

let db: Awaited<ReturnType<typeof startTestDb>>;

beforeAll(async () => {
  db = await startTestDb();
  await db.pool.query(
    `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at)
     VALUES ($1, 'token-sha', 1, now())`,
    [agentHash],
  );
  await seedVerifiedActivity(db.pool, "row-swap", "swap", "100.50", 10);
  await seedVerifiedActivity(db.pool, "row-fill", "bridge_fill_observed", "77.00", 10);
  await db.pool.query(
    `INSERT INTO activities
       (agent_hash, source_row_id, public_id, source_execution_id, event_index, kind, event_role, status,
        protocol, chain_family, chain_id, usd_in_est, client_created_at, client_confirmed_at,
        statuses_seen, verification_state, received_at, received_schema_version)
     VALUES ($1, 'row-unverified', 'row-unverified', 'exec-2', 0, 'swap', 'swap', 'confirmed',
             'kyberswap', 'eip155', 8453, 999.00, now() - interval '10 minutes',
             now() - interval '10 minutes', ARRAY['confirmed'], 'none', now(), 1)`,
    [agentHash],
  );
}, 120_000);

afterAll(async () => {
  await db.stop();
});

describe("chartBuckets for the 24h range", () => {
  it("returns twenty four hourly buckets even though only one hour has data", async () => {
    const buckets = await chartBuckets(db.pool, resolveChartRange("24h"));

    expect(buckets).toHaveLength(24);
  });

  it("sums volume only for swap and bridge_deposit legs", async () => {
    const buckets = await chartBuckets(db.pool, resolveChartRange("24h"));
    const withActivity = buckets.filter((bucket) => bucket.txCount > 0);

    expect(withActivity.map(({ volumeUsd, txCount }) => ({ volumeUsd, txCount }))).toEqual([
      { volumeUsd: "100.50", txCount: 2 },
    ]);
  });

  it("leaves unverified rows out of every bucket", async () => {
    const buckets = await chartBuckets(db.pool, resolveChartRange("24h"));

    expect(buckets.reduce((total, bucket) => total + bucket.txCount, 0)).toBe(2);
  });

  it("orders buckets ascending by bucketStart", async () => {
    const buckets = await chartBuckets(db.pool, resolveChartRange("24h"));
    const starts = buckets.map((bucket) => bucket.bucketStart);

    expect(starts).toEqual([...starts].sort((left, right) => left - right));
  });

  it("aligns every bucketStart to a whole hour", async () => {
    const buckets = await chartBuckets(db.pool, resolveChartRange("24h"));

    expect(buckets.every((bucket) => bucket.bucketStart % 3600 === 0)).toBe(true);
  });
});

describe("chartBuckets for the 7d range", () => {
  it("returns twenty eight six-hour buckets", async () => {
    const buckets = await chartBuckets(db.pool, resolveChartRange("7d"));

    expect(buckets).toHaveLength(28);
  });

  it("aligns every bucketStart to a whole six-hour step", async () => {
    const buckets = await chartBuckets(db.pool, resolveChartRange("7d"));

    expect(buckets.every((bucket) => bucket.bucketStart % 21600 === 0)).toBe(true);
  });
});

function utcMidnightSecondsToday(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;
}

describe("chartBuckets for the all range", () => {
  it("spans a single day when no aggregate was ever written and fills it with the priced volume", async () => {
    const buckets = await chartBuckets(db.pool, resolveChartRange("all"));

    expect(buckets).toEqual([
      { bucketStart: utcMidnightSecondsToday(), volumeUsd: "100.50", txCount: 0 },
    ]);
  });
});
