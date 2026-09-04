import type pg from "pg";
import { afterEach, beforeAll, afterAll, describe, expect, it } from "vitest";
import { recomputeDailyAggregates } from "../../cli/aggregate-recompute.js";
import { aggregateTotals, protocolRanking } from "../../repos/read-repo.js";
import { startTestDb } from "../../testing/pg-harness.js";

/**
 * THE ONE-TIME RECOMPUTE, over a table that already carries the pre-fold counts.
 *
 * `daily_aggregates` is written incrementally and never recomputed, so every fee leg verified
 * BEFORE the fold is still counted as a transaction in `total_tx`, `daily_tx` and the per-protocol
 * ranking. The seed below is exactly that situation: three actions and two fee legs, with the
 * aggregate row stating five transactions the way the incremental writer left it.
 */

const agentHash = "f".repeat(64);

type LegSeed = {
  publicId: string;
  eventRole: string;
  usdInEst: string;
  usdInPriced: string | null;
};

const LEGS: LegSeed[] = [
  { publicId: "agg-swap-1", eventRole: "swap", usdInEst: "100.00", usdInPriced: "101.00" },
  { publicId: "agg-fee-1", eventRole: "vex_fee", usdInEst: "0.25", usdInPriced: "0.26" },
  { publicId: "agg-swap-2", eventRole: "swap", usdInEst: "200.00", usdInPriced: "202.00" },
  { publicId: "agg-fee-2", eventRole: "vex_fee", usdInEst: "0.50", usdInPriced: "0.51" },
  // Priced but NOT capital-deploying, so it contributes a transaction and no volume.
  { publicId: "agg-claim", eventRole: "pools_claim", usdInEst: "0.00", usdInPriced: null },
];

async function seed(pool: pg.Pool): Promise<void> {
  await pool.query(
    `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, name, status)
     VALUES ($1, 'token-sha', 1, now(), 'Vex-agg-01', 'active')`,
    [agentHash],
  );
  for (const [index, leg] of LEGS.entries()) {
    await pool.query(
      `INSERT INTO activities
         (agent_hash, source_row_id, public_id, source_execution_id, event_index,
          kind, event_role, status, protocol, chain_family, chain_id,
          token_in_address, token_in_symbol, token_in_decimals,
          amount_in_raw, executed_in_raw, usd_in_est, usd_in_priced,
          pricing_state, tx_hash, client_created_at, client_confirmed_at, statuses_seen,
          verification_state, verified_at, received_schema_version)
       VALUES ($1, $2, $2, $2, $3,
               CASE WHEN $4 = 'pools_claim' THEN 'claim' ELSE 'swap' END,
               $4, 'confirmed', 'kyberswap', 'eip155', 8453,
               '0x4200000000000000000000000000000000000006', 'ETH', 18,
               '1000', '1000', $5::numeric, $6::numeric,
               CASE WHEN $6::numeric IS NULL THEN 'unpriced' ELSE 'server_priced' END,
               $2, now() - interval '2 hours', now() - interval '1 hour', ARRAY['confirmed'],
               'verified_full', now(), 1)`,
      [agentHash, leg.publicId, index, leg.eventRole, leg.usdInEst, leg.usdInPriced],
    );
  }
}

/** The aggregate row as the incremental writer left it BEFORE the fold: five transactions. */
async function seedPreFoldAggregate(pool: pg.Pool): Promise<void> {
  await pool.query("DELETE FROM daily_aggregates");
  await pool.query(
    `INSERT INTO daily_aggregates (day, protocol, kind, volume_usd, tx_count, volume_usd_priced)
     SELECT (COALESCE(client_confirmed_at, block_time, verified_at) AT TIME ZONE 'utc')::date,
            'kyberswap', 'swap', 300.75, 5, 303.77
       FROM activities LIMIT 1`,
  );
}

let db: Awaited<ReturnType<typeof startTestDb>>;

beforeAll(async () => {
  db = await startTestDb();
  await seed(db.pool);
}, 120_000);

afterEach(async () => {
  await seedPreFoldAggregate(db.pool);
});

afterAll(async () => {
  await db.stop();
});

beforeAll(async () => {
  await seedPreFoldAggregate(db.pool);
});

describe("recomputeDailyAggregates", () => {
  it("removes exactly the fee legs from the published transaction count", async () => {
    const outcome = await recomputeDailyAggregates(db.pool);

    expect(outcome.before.txCount).toBe(5);
    expect(outcome.after.txCount).toBe(3);
    expect(outcome.txCountRemoved).toBe(2);
  });

  // The fold is the ONLY behaviour that changes. Volume is summed over capital-deploying roles on
  // its own basis, exactly as the incremental writers do, so a recompute that moved a volume figure
  // would be restating history rather than repairing a count.
  it("rebuilds the volumes on their own bases, unchanged by the fold", async () => {
    const outcome = await recomputeDailyAggregates(db.pool);

    expect(outcome.after.volumeUsd).toBe("300.00");
    expect(outcome.after.volumeUsdPriced).toBe("303.00");
  });

  it("is idempotent: a second run reads back exactly what the first one wrote", async () => {
    const first = await recomputeDailyAggregates(db.pool);
    const second = await recomputeDailyAggregates(db.pool);

    expect(second.before).toEqual(first.after);
    expect(second.after).toEqual(first.after);
    expect(second.txCountRemoved).toBe(0);
  });

  it("makes the published totals agree with the folded feed", async () => {
    await recomputeDailyAggregates(db.pool);
    const totals = await aggregateTotals(db.pool);
    const [kyberswap] = await protocolRanking(db.pool, null);

    expect(totals.totalTx).toBe(3);
    expect(kyberswap?.txCount).toBe(3);
  });

  // A day/protocol/kind whose rows are gone must LEAVE the table. An upsert alone would leave its
  // old total behind for ever, which is the failure mode "recompute" exists to rule out.
  it("deletes an aggregate row whose activities no longer exist", async () => {
    await db.pool.query(
      `INSERT INTO daily_aggregates (day, protocol, kind, volume_usd, tx_count, volume_usd_priced)
       VALUES (date '2020-01-01', 'ghost-protocol', 'swap', 999, 999, 999)`,
    );

    await recomputeDailyAggregates(db.pool);

    const remaining = await db.pool.query("SELECT protocol FROM daily_aggregates WHERE protocol = 'ghost-protocol'");
    expect(remaining.rowCount).toBe(0);
  });

  it("ignores unverified rows, which have never contributed to these totals", async () => {
    await db.pool.query(
      `INSERT INTO activities
         (agent_hash, source_row_id, public_id, source_execution_id, event_index,
          kind, event_role, status, protocol, chain_family, chain_id,
          token_in_address, token_in_symbol, token_in_decimals,
          amount_in_raw, executed_in_raw, usd_in_est,
          tx_hash, client_created_at, client_confirmed_at, statuses_seen,
          verification_state, received_schema_version)
       VALUES ($1, 'agg-unverified', 'agg-unverified', 'agg-unverified', 0,
               'swap', 'swap', 'confirmed', 'kyberswap', 'eip155', 8453,
               '0x42', 'ETH', 18, '1000', '1000', '5000.00',
               '0xunverified', now(), now(), ARRAY['confirmed'], 'queued', 1)`,
      [agentHash],
    );

    const outcome = await recomputeDailyAggregates(db.pool);

    expect(outcome.after.txCount).toBe(3);
    expect(outcome.after.volumeUsd).toBe("300.00");

    await db.pool.query("DELETE FROM activities WHERE public_id = 'agg-unverified'");
  });
});
