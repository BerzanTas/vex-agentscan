import type pg from "pg";
import { capitalDeployingRolesIn, vexFeeLegRolesIn } from "@agentscan/core";
import { activityAggregateDaySql, activityTimeAnchorSql } from "../repos/activity-time-anchor.js";

/**
 * ONE-TIME AGGREGATE RECOMPUTE, AFTER THE VEX FEE FOLD (owner decision A1/V2, 2026-09-04).
 *
 * `daily_aggregates` is written INCREMENTALLY and never recomputed: `activities-verify-repo` adds
 * one row's volume and transaction count as it verifies, and the pricing lane adds its priced
 * volume as it prices. That is why folding the fee leg out of the read model was not enough - every
 * fee leg verified BEFORE the fold is still counted as a transaction inside these totals, so
 * `total_tx`, `daily_tx`, the per-protocol counts and the chart buckets keep publishing a number
 * that the feed beside them contradicts. This command rebuilds the table from `activities`, which
 * is the durable ledger and the only source that can answer the question after the fact.
 *
 * ── THE OPERATIONAL CONTRACT ──────────────────────────────────────────────────────────────────
 *
 * 1. PAUSE THE WRITERS FIRST. The verification and pricing workers add to these same rows. Stop
 *    them (scale the worker deployment to zero) before running this, and start them again after.
 *    The command does NOT pause them for you: this process cannot see the other process, and a
 *    command that claimed to have stopped a worker it never touched would be lying about the one
 *    fact the whole operation depends on. It DOES take a transaction-scoped advisory lock, so two
 *    concurrent recomputes serialize, and it runs inside ONE transaction, so a worker that was
 *    left running produces a serialization failure rather than a silently half-rebuilt table.
 *
 * 2. THE POPULATION IS THE VERIFIED ONE, and it is identical to what the incremental writers use:
 *    `verification_state IN ('verified_full','verified_basic')`. Nothing else has ever contributed
 *    to these totals, so nothing else may contribute now - a recompute that widened the population
 *    would silently restate history rather than repair it.
 *
 * 3. THE THREE COLUMNS ARE REBUILT ON THEIR OWN BASES, unchanged:
 *      volume_usd        the client's estimate, summed over capital-DEPLOYING roles only;
 *      volume_usd_priced the server's own price, over the same roles, for server-priced rows only;
 *      tx_count          one per row, EXCEPT a Vex fee leg, which counts zero - the fold.
 *    The fee fold is the only behaviour that changes. Every other definition is copied from the
 *    incremental writers so that "recompute" means "the same arithmetic over the whole set".
 *
 * 4. IDEMPOTENT. Running it twice produces the same table, because it derives every value from
 *    `activities` rather than adding to what is there. A day/protocol/kind whose rows have all been
 *    purged is DELETED rather than left at its old total.
 *
 * 5. AUDIT ROWS BEFORE AND AFTER. The command returns the totals it replaced and the totals it
 *    wrote, per column, so the operator can see exactly how many transactions the fold removed and
 *    whether the volume figures moved at all (they must not).
 */

const AGGREGATE_RECOMPUTE_LOCK_KEY = "daily_aggregates:recompute";

const VERIFIED_POPULATION = "a.verification_state IN ('verified_full','verified_basic')";
const VOLUME_LEG = capitalDeployingRolesIn("a.event_role");
const FEE_LEG = vexFeeLegRolesIn("a.event_role");

/**
 * The rebuilt table, expressed once and used for both the audit read and the write, so the numbers
 * the operator is shown are produced by the same expression that lands in the table.
 */
const RECOMPUTED_AGGREGATES = `
  SELECT ${activityAggregateDaySql("a")} AS day,
         a.protocol,
         a.kind,
         COALESCE(SUM(CASE WHEN ${VOLUME_LEG} THEN COALESCE(a.usd_in_est, 0) ELSE 0 END), 0) AS volume_usd,
         COUNT(*) FILTER (WHERE NOT (${FEE_LEG}))::int AS tx_count,
         COALESCE(SUM(
           CASE WHEN ${VOLUME_LEG} AND a.pricing_state = 'server_priced'
                THEN COALESCE(a.usd_in_priced, a.usd_out_priced, 0)
                ELSE 0 END
         ), 0) AS volume_usd_priced
    FROM activities a
   WHERE ${VERIFIED_POPULATION}
     AND ${activityTimeAnchorSql("a")} IS NOT NULL
   GROUP BY 1, 2, 3`;

export type AggregateTotalsAudit = {
  rowCount: number;
  volumeUsd: string;
  volumeUsdPriced: string;
  txCount: number;
};

export type AggregateRecomputeOutcome = {
  before: AggregateTotalsAudit;
  after: AggregateTotalsAudit;
  /** Transactions the fee fold removed from the published counts. Never negative in a sound table. */
  txCountRemoved: number;
};

type TotalsRow = {
  row_count: string;
  volume_usd: string;
  volume_usd_priced: string;
  tx_count: string;
};

function auditFrom(row: TotalsRow | undefined): AggregateTotalsAudit {
  if (row === undefined) throw new Error("aggregate recompute audit query returned no rows");
  return {
    rowCount: Number(row.row_count),
    volumeUsd: row.volume_usd,
    volumeUsdPriced: row.volume_usd_priced,
    txCount: Number(row.tx_count),
  };
}

const TOTALS_OF = (source: string) => `
  SELECT COUNT(*)::text                         AS row_count,
         COALESCE(SUM(volume_usd), 0)::text     AS volume_usd,
         COALESCE(SUM(volume_usd_priced), 0)::text AS volume_usd_priced,
         COALESCE(SUM(tx_count), 0)::text       AS tx_count
    FROM (${source}) totals`;

export async function recomputeDailyAggregates(pool: pg.Pool): Promise<AggregateRecomputeOutcome> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [AGGREGATE_RECOMPUTE_LOCK_KEY]);

    const before = auditFrom(
      (await client.query<TotalsRow>(TOTALS_OF("SELECT * FROM daily_aggregates"))).rows[0],
    );
    const after = auditFrom((await client.query<TotalsRow>(TOTALS_OF(RECOMPUTED_AGGREGATES))).rows[0]);

    // Replace rather than merge: a day/protocol/kind whose rows are gone must leave the table, and
    // an UPSERT alone would leave its old total behind for ever.
    await client.query("DELETE FROM daily_aggregates");
    await client.query(
      `INSERT INTO daily_aggregates (day, protocol, kind, volume_usd, tx_count, volume_usd_priced)
       SELECT day, protocol, kind, volume_usd, tx_count, volume_usd_priced FROM (${RECOMPUTED_AGGREGATES}) rebuilt`,
    );

    await client.query("COMMIT");
    return { before, after, txCountRemoved: before.txCount - after.txCount };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
