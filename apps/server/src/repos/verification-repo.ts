import type pg from "pg";
import { logicalRowIn } from "@agentscan/core";

/**
 * A Vex fee leg is verified like any other row, but it is not an entry of this site: it is folded
 * under the action it charges for everywhere else, so counting it here would make the verification
 * summary disagree with every count beside it. The complement is deliberately WIDE - both bridge
 * legs and both Pendle legs are real rows and stay counted; only the fee leg goes.
 */
const LOGICAL_ROW = logicalRowIn("event_role");
const LOGICAL_ROW_A = logicalRowIn("a.event_role");

export type LatencySecondsRead = { median: number | null; p90: number | null };

export type VerificationSummaryRead = {
  verifiedFull: number;
  verifiedBasic: number;
  queued: number;
  latencySeconds: LatencySecondsRead;
};

type VerificationSummaryRow = {
  verified_full: number;
  verified_basic: number;
  queued: number;
  median_latency_seconds: number | null;
  p90_latency_seconds: number | null;
};

const VERIFICATION_SUMMARY = `
  WITH published AS (
    SELECT verification_state,
           extract(epoch FROM verified_at - client_confirmed_at)::double precision AS latency_seconds
    FROM activities
    WHERE verification_state IN ('verified_full','verified_basic')
      AND ${LOGICAL_ROW}
  ),
  awaiting AS (
    SELECT COUNT(*)::int AS queued
    FROM verification_jobs j
    JOIN activities a ON a.id = j.activity_id
    WHERE a.verification_state IN ('none','queued')
      AND ${LOGICAL_ROW_A}
  )
  SELECT
    COUNT(*) FILTER (WHERE verification_state = 'verified_full')::int AS verified_full,
    COUNT(*) FILTER (WHERE verification_state = 'verified_basic')::int AS verified_basic,
    (SELECT queued FROM awaiting) AS queued,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_seconds)
      FILTER (WHERE latency_seconds IS NOT NULL) AS median_latency_seconds,
    percentile_cont(0.9) WITHIN GROUP (ORDER BY latency_seconds)
      FILTER (WHERE latency_seconds IS NOT NULL) AS p90_latency_seconds
  FROM published`;

export async function verificationSummary(pool: pg.Pool): Promise<VerificationSummaryRead> {
  const result = await pool.query<VerificationSummaryRow>(VERIFICATION_SUMMARY);
  const row = result.rows[0];
  if (row === undefined) throw new Error("verification summary query returned no rows");
  return {
    verifiedFull: row.verified_full,
    verifiedBasic: row.verified_basic,
    queued: row.queued,
    latencySeconds: { median: row.median_latency_seconds, p90: row.p90_latency_seconds },
  };
}
