import type pg from "pg";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveChain } from "@agentscan/core";
import { loadConfig } from "../../config.js";
import { agentPageActivities } from "../../repos/agent-page-repo.js";
import {
  aggregateTotals,
  lookupPublicId,
  protocolRanking,
  visibleActivityByPublicId,
  visibleActivityPage,
} from "../../repos/read-repo.js";
import { startTestDb } from "../../testing/pg-harness.js";
import { selectChainReader } from "../../verification/chain-reader-selection.js";
import { runVerificationPass } from "../../worker/loop.js";

// One agent, three executions, each one action plus the Vex fee leg it paid:
//
//   trench-swap  swap        confirmed  + trench_fee confirmed   the ordinary case
//   failed-swap  swap        failed     + trench_fee confirmed   rule A9
//   plain-swap   swap        confirmed  (no fee leg)             the null case
//
// Only confirmed rows enter verification - `activities-ingest-repo.initialVerificationState` queues
// nothing for a failed one - so the failed action is seeded unverified and reaches the feed through
// the second arm of the visibility rule, once its agent has a verified activity. It is therefore
// absent from the counts, which read verified rows only; its fee leg is not, and that is exactly
// the row the fold has to keep out.
//
// Every assertion below is about the FOLD: a fee leg is never an entry of its own, and the charge
// reappears on the action it paid for. Reverting the fold turns each of them red.

const agentHash = "d".repeat(64);

const confirmAllConfig = loadConfig({
  DATABASE_URL: "postgres://unused-in-tests",
  VERIFY_FAKE_MODE: "confirm_all",
});

const logger = pino({ level: "silent" });

type LegSeed = {
  publicId: string;
  executionId: string;
  eventIndex: number;
  eventRole: string;
  status: "confirmed" | "definitively_failed";
  txHash: string;
  amountInRaw: string;
  usdInEst: string;
  verify: boolean;
};

const LEGS: LegSeed[] = [
  {
    publicId: "fold-parent-ok",
    executionId: "exec-trench-swap",
    eventIndex: 0,
    eventRole: "swap",
    status: "confirmed",
    txHash: "0xparentok",
    amountInRaw: "1000000000000000000",
    usdInEst: "3300.00",
    verify: true,
  },
  {
    publicId: "fold-fee-ok",
    executionId: "exec-trench-swap",
    eventIndex: 1,
    eventRole: "trench_fee",
    status: "confirmed",
    txHash: "0xfeeok",
    amountInRaw: "2500000000000000",
    usdInEst: "8.25",
    verify: true,
  },
  {
    publicId: "fold-parent-failed",
    executionId: "exec-failed-swap",
    eventIndex: 0,
    eventRole: "swap",
    status: "definitively_failed",
    txHash: "0xparentfailed",
    amountInRaw: "500000000000000000",
    usdInEst: "1650.00",
    verify: false,
  },
  {
    publicId: "fold-fee-on-failed",
    executionId: "exec-failed-swap",
    eventIndex: 1,
    eventRole: "trench_fee",
    status: "confirmed",
    txHash: "0xfeeonfailed",
    amountInRaw: "1250000000000000",
    usdInEst: "4.13",
    verify: true,
  },
  {
    publicId: "fold-plain",
    executionId: "exec-plain-swap",
    eventIndex: 0,
    eventRole: "swap",
    status: "confirmed",
    txHash: "0xplain",
    amountInRaw: "2000000000000000000",
    usdInEst: "6600.00",
    verify: true,
  },
];

async function seedLeg(pool: pg.Pool, leg: LegSeed): Promise<void> {
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO activities
       (agent_hash, source_row_id, public_id, source_execution_id, event_index, kind, event_role,
        status, protocol, chain_family, chain_id,
        token_in_address, token_in_symbol, token_in_decimals,
        amount_in_raw, executed_in_raw, usd_in_est, usd_in_priced, pricing_state,
        tx_hash, client_created_at, client_confirmed_at, statuses_seen,
        verification_state, received_schema_version)
     VALUES ($1, $2, $2, $3, $4, 'swap', $5,
             $6, 'kyberswap', 'eip155', 8453,
             '0x4200000000000000000000000000000000000006', 'ETH', 18,
             $7, $7, $8::numeric, $8::numeric, 'server_priced',
             $9, now() - interval '2 hours', now() - interval '1 hour', ARRAY['pending', $6],
             CASE WHEN $10::bool THEN 'queued' ELSE 'none' END, 1)
     RETURNING id`,
    [
      agentHash,
      leg.publicId,
      leg.executionId,
      leg.eventIndex,
      leg.eventRole,
      leg.status,
      leg.amountInRaw,
      leg.usdInEst,
      leg.txHash,
      leg.verify,
    ],
  );
  const row = inserted.rows[0];
  if (row === undefined) throw new Error("seed insert returned no row");
  if (!leg.verify) return;
  await pool.query(
    `INSERT INTO verification_jobs (activity_id, attempts, first_attempt_at, next_attempt_at)
     VALUES ($1, 0, now(), now() - interval '1 second')`,
    [row.id],
  );
}

let db: Awaited<ReturnType<typeof startTestDb>>;

beforeAll(async () => {
  db = await startTestDb();
  await db.pool.query(
    `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, name, status)
     VALUES ($1, 'token-sha', 1, now(), 'Vex-fold-01', 'active')`,
    [agentHash],
  );
  for (const leg of LEGS) await seedLeg(db.pool, leg);
  await runVerificationPass({
    pool: db.pool,
    config: confirmAllConfig,
    now: () => new Date(),
    resolveChain,
    chainReaderFor: (entry, context) => selectChainReader(entry, confirmAllConfig, context),
    logger,
  });
}, 120_000);

afterAll(async () => {
  await db.stop();
});

const feedPage = () =>
  visibleActivityPage(db.pool, {
    cursor: null,
    limit: 50,
    kind: null,
    protocol: null,
    chainPairs: null,
    status: null,
    verification: null,
  });

describe("the Vex fee leg folded under the action it charged for", () => {
  it("lists one row per action and never the fee leg itself", async () => {
    const rows = await feedPage();

    expect(rows.map((row) => row.public_id).sort()).toEqual([
      "fold-parent-failed",
      "fold-parent-ok",
      "fold-plain",
    ]);
  });

  it("carries the fee leg's amount, hash and status on its parent row", async () => {
    const rows = await feedPage();
    const parent = rows.find((row) => row.public_id === "fold-parent-ok");

    expect({
      amount: parent?.vex_fee_amount_raw,
      decimals: parent?.vex_fee_decimals,
      symbol: parent?.vex_fee_symbol,
      txHash: parent?.vex_fee_tx_hash,
      status: parent?.vex_fee_status,
      usdEst: parent?.vex_fee_usd_est,
    }).toEqual({
      amount: "2500000000000000",
      decimals: 18,
      symbol: "ETH",
      txHash: "0xfeeok",
      status: "confirmed",
      usdEst: "8.25",
    });
  });

  it("leaves an action that paid no fee with no fee at all", async () => {
    const rows = await feedPage();
    const plain = rows.find((row) => row.public_id === "fold-plain");

    expect(plain?.vex_fee_status).toBe(null);
    expect(plain?.vex_fee_amount_raw).toBe(null);
  });

  // A9: the fee confirmed on-chain, so it stays visible even though the action it paid for failed.
  it("keeps a confirmed fee on an action that definitively failed", async () => {
    const rows = await feedPage();
    const failed = rows.find((row) => row.public_id === "fold-parent-failed");

    expect(failed?.status).toBe("definitively_failed");
    expect(failed?.vex_fee_status).toBe("confirmed");
    expect(failed?.vex_fee_amount_raw).toBe("1250000000000000");
  });

  // Four rows verify - two actions and two fee legs - and only the two actions are transactions.
  it("counts the verified actions in the totals and neither of the verified fee legs", async () => {
    const totals = await aggregateTotals(db.pool);

    expect(totals.totalTx).toBe(2);
    expect(totals.dailyTx).toBe(2);
  });

  it("counts the same two transactions for the protocol", async () => {
    const [kyberswap] = await protocolRanking(db.pool, null);

    expect(kyberswap?.protocol).toBe("kyberswap");
    expect(kyberswap?.txCount).toBe(2);
  });

  it("gives the agent page the actions alone", async () => {
    const window = await agentPageActivities(db.pool, agentHash, 100);

    expect(window.activities).toHaveLength(2);
    expect(window.activities.every((activity) => activity.eventRole === "swap")).toBe(true);
  });

  it("resolves the FEE transaction hash to the action's public id", async () => {
    expect(await lookupPublicId(db.pool, "0xfeeok")).toBe("fold-parent-ok");
    expect(await lookupPublicId(db.pool, "0xfeeonfailed")).toBe("fold-parent-failed");
  });

  it("resolves the fee leg's own public id to the action's public id", async () => {
    expect(await lookupPublicId(db.pool, "fold-fee-ok")).toBe("fold-parent-ok");
  });

  // The tx page must never render a fee leg as a record: asking for one answers with the action.
  it("serves the action when a fee leg's public id is opened directly", async () => {
    const detail = await visibleActivityByPublicId(db.pool, "fold-fee-ok");

    expect(detail?.public_id).toBe("fold-parent-ok");
    expect(detail?.event_role).toBe("swap");
    expect(detail?.vex_fee_tx_hash).toBe("0xfeeok");
  });

  it("still serves an ordinary action by its own public id", async () => {
    const detail = await visibleActivityByPublicId(db.pool, "fold-plain");

    expect(detail?.public_id).toBe("fold-plain");
    expect(detail?.vex_fee_status).toBe(null);
  });
});
