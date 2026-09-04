import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  visibleActivityByPublicId,
  visibleActivityPage,
  type ActivityDbRow,
} from "../../repos/read-repo.js";
import { verificationSummary } from "../../repos/verification-repo.js";
import { startTestDb } from "../../testing/pg-harness.js";

/**
 * THE FEE FOLD OVER MULTI-LEG EXECUTIONS AND OVER A FEE THAT DID NOT CONFIRM.
 *
 * The first version of the fold attached the fee to every non-fee leg of its execution, and showed
 * a fee only once it was confirmed. Both were wrong, and both are wrong in a way a single-leg swap
 * cannot reveal:
 *
 *   - a bridge execution produces a deposit, a fee and a fill; a Pendle split produces two mint
 *     legs and one fee. Attaching the fee to each non-fee leg renders the SAME charge two or three
 *     times, which is the fold's purpose inverted into a double count. The parent is the
 *     LOWEST-indexed non-fee leg of the execution and nothing else - the same row `LOGICAL_ROW_ID`
 *     resolves a fee leg's public id and hash to, so the two can never disagree.
 *   - a fee that is still pending, or one that reverted, has to be VISIBLE with its status (owner
 *     decision V1), and must feed NO money field: an attempted charge is not a charge.
 *
 * Every row here is seeded directly rather than ingested, because these are read-model rules over
 * the durable table. The Pendle execution carries a `vex_fee` leg on the `yield` kind, which the
 * ingest contract does not admit today (`ROLES_BY_KIND` gives yield no fee arm, mirroring the
 * producer's own binding). It is seeded anyway on purpose: the fold must be correct for any shape
 * the TABLE can hold, so that widening the ingest binding later - the Virtuals curve fee is already
 * planned - cannot quietly reintroduce a double charge.
 */

const agentHash = "e".repeat(64);

type LegSeed = {
  publicId: string;
  executionId: string;
  eventIndex: number;
  kind: string;
  eventRole: string;
  status: "pending" | "confirmed" | "definitively_failed";
  txHash: string;
  amountInRaw: string;
};

const LEGS: LegSeed[] = [
  // A bridge: deposit, then the fee, then the arrival. Both the deposit and the fill are entries.
  { publicId: "br-deposit", executionId: "exec-bridge", eventIndex: 0, kind: "bridge", eventRole: "bridge_deposit", status: "confirmed", txHash: "0xbrdep", amountInRaw: "1000" },
  { publicId: "br-fee", executionId: "exec-bridge", eventIndex: 1, kind: "bridge", eventRole: "bridge_fee", status: "confirmed", txHash: "0xbrfee", amountInRaw: "25" },
  { publicId: "br-fill", executionId: "exec-bridge", eventIndex: 2, kind: "bridge", eventRole: "bridge_fill_expected", status: "confirmed", txHash: "0xbrfill", amountInRaw: "975" },
  // A refund arrives on the same execution when the bridge gives the money back.
  { publicId: "br-refund", executionId: "exec-bridge", eventIndex: 3, kind: "bridge", eventRole: "bridge_refund", status: "confirmed", txHash: "0xbrrefund", amountInRaw: "975" },

  // A Pendle split: TWO mint legs before the fee, so the parent is the lower of two adjacent
  // non-fee legs rather than simply "the one before the fee".
  { publicId: "py-pt", executionId: "exec-pendle", eventIndex: 0, kind: "yield", eventRole: "yield_pt", status: "confirmed", txHash: "0xpypt", amountInRaw: "500" },
  { publicId: "py-yt", executionId: "exec-pendle", eventIndex: 1, kind: "yield", eventRole: "yield_yt", status: "confirmed", txHash: "0xpyyt", amountInRaw: "500" },
  { publicId: "py-fee", executionId: "exec-pendle", eventIndex: 2, kind: "yield", eventRole: "vex_fee", status: "confirmed", txHash: "0xpyfee", amountInRaw: "12" },

  // A fee still in flight over a settled action.
  { publicId: "pend-action", executionId: "exec-pending-fee", eventIndex: 0, kind: "swap", eventRole: "swap", status: "confirmed", txHash: "0xpendact", amountInRaw: "700" },
  { publicId: "pend-fee", executionId: "exec-pending-fee", eventIndex: 1, kind: "swap", eventRole: "vex_fee", status: "pending", txHash: "0xpendfee", amountInRaw: "17" },

  // A fee that reverted, and was never retried.
  { publicId: "fail-action", executionId: "exec-failed-fee", eventIndex: 0, kind: "swap", eventRole: "swap", status: "confirmed", txHash: "0xfailact", amountInRaw: "800" },
  { publicId: "fail-fee", executionId: "exec-failed-fee", eventIndex: 1, kind: "swap", eventRole: "vex_fee", status: "definitively_failed", txHash: "0xfailfee", amountInRaw: "20" },

  // A fee that reverted and was RETRIED successfully: the money must come from the leg that landed.
  { publicId: "retry-action", executionId: "exec-retried-fee", eventIndex: 0, kind: "swap", eventRole: "swap", status: "confirmed", txHash: "0xretryact", amountInRaw: "900" },
  { publicId: "retry-fee-1", executionId: "exec-retried-fee", eventIndex: 1, kind: "swap", eventRole: "vex_fee", status: "definitively_failed", txHash: "0xretryfee1", amountInRaw: "22" },
  { publicId: "retry-fee-2", executionId: "exec-retried-fee", eventIndex: 2, kind: "swap", eventRole: "vex_fee", status: "confirmed", txHash: "0xretryfee2", amountInRaw: "23" },

  // TWO confirmed fees on one execution: a producer defect. Reporting one as the whole charge would
  // understate the money, so the row must report no fee at all.
  { publicId: "dbl-action", executionId: "exec-double-fee", eventIndex: 0, kind: "swap", eventRole: "swap", status: "confirmed", txHash: "0xdblact", amountInRaw: "1100" },
  { publicId: "dbl-fee-1", executionId: "exec-double-fee", eventIndex: 1, kind: "swap", eventRole: "vex_fee", status: "confirmed", txHash: "0xdblfee1", amountInRaw: "27" },
  { publicId: "dbl-fee-2", executionId: "exec-double-fee", eventIndex: 2, kind: "swap", eventRole: "vex_fee", status: "confirmed", txHash: "0xdblfee2", amountInRaw: "28" },
];

async function seedLeg(pool: pg.Pool, leg: LegSeed): Promise<void> {
  await pool.query(
    `INSERT INTO activities
       (agent_hash, source_row_id, public_id, source_execution_id, event_index, kind, event_role,
        status, protocol, chain_family, chain_id,
        token_in_address, token_in_symbol, token_in_decimals,
        amount_in_raw, executed_in_raw, usd_in_est,
        tx_hash, client_created_at, client_confirmed_at, statuses_seen,
        verification_state, verified_at, received_schema_version)
     VALUES ($1, $2, $2, $3, $4, $5, $6,
             $7, 'relay', 'eip155', 8453,
             '0x4200000000000000000000000000000000000006', 'ETH', 18,
             $8, $8, '1.00'::numeric,
             $9, now() - interval '2 hours', now() - interval '1 hour', ARRAY['pending', $7],
             'verified_full', now(), 1)`,
    [
      agentHash,
      leg.publicId,
      leg.executionId,
      leg.eventIndex,
      leg.kind,
      leg.eventRole,
      leg.status,
      leg.amountInRaw,
      leg.txHash,
    ],
  );
}

let db: Awaited<ReturnType<typeof startTestDb>>;

beforeAll(async () => {
  db = await startTestDb();
  await db.pool.query(
    `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, name, status)
     VALUES ($1, 'token-sha', 1, now(), 'Vex-shapes-01', 'active')`,
    [agentHash],
  );
  for (const leg of LEGS) await seedLeg(db.pool, leg);
}, 120_000);

afterAll(async () => {
  await db.stop();
});

const feedPage = () =>
  visibleActivityPage(db.pool, {
    cursor: null,
    limit: 100,
    kind: null,
    protocol: null,
    chainPairs: null,
    status: null,
    verification: null,
  });

const rowBy = (rows: readonly ActivityDbRow[], publicId: string): ActivityDbRow => {
  const row = rows.find((candidate) => candidate.public_id === publicId);
  if (row === undefined) throw new Error(`row ${publicId} is missing from the feed`);
  return row;
};

describe("a bridge execution, whose fee sits between two entries", () => {
  it("keeps the deposit, the fill and the refund as entries and drops only the fee", async () => {
    const rows = await feedPage();
    const bridge = rows.filter((row) => row.source_execution_id === "exec-bridge");

    expect(bridge.map((row) => row.public_id).sort()).toEqual([
      "br-deposit",
      "br-fill",
      "br-refund",
    ]);
  });

  // THE DOUBLE-CHARGE DEFECT. Reverting the parent gate turns this red: the fill and the refund
  // would each render the same 25 as their own fee, and the page would state three charges.
  it("shows the charge once, on the lowest-indexed leg, and on no other leg of the execution", async () => {
    const rows = await feedPage();

    expect(rowBy(rows, "br-deposit").vex_fee_tx_hash).toBe("0xbrfee");
    expect(rowBy(rows, "br-deposit").vex_fee_amount_raw).toBe("25");
    expect(rowBy(rows, "br-fill").vex_fee_status).toBeNull();
    expect(rowBy(rows, "br-fill").vex_fee_amount_raw).toBeNull();
    expect(rowBy(rows, "br-refund").vex_fee_status).toBeNull();
  });

  it("resolves the fee leg's hash and public id to that same parent, so the two agree", async () => {
    const detail = await visibleActivityByPublicId(db.pool, "br-fee");

    expect(detail?.public_id).toBe("br-deposit");
    expect(detail?.vex_fee_tx_hash).toBe("0xbrfee");
  });
});

describe("a Pendle split, whose two mint legs both precede the fee", () => {
  it("keeps both mint legs as entries", async () => {
    const rows = await feedPage();
    const pendle = rows.filter((row) => row.source_execution_id === "exec-pendle");

    expect(pendle.map((row) => row.public_id).sort()).toEqual(["py-pt", "py-yt"]);
  });

  it("shows the charge on the first mint leg only", async () => {
    const rows = await feedPage();

    expect(rowBy(rows, "py-pt").vex_fee_amount_raw).toBe("12");
    expect(rowBy(rows, "py-yt").vex_fee_status).toBeNull();
  });
});

describe("a fee that has not confirmed", () => {
  it("shows a pending fee with its status and its hash, and no amount", async () => {
    const row = rowBy(await feedPage(), "pend-action");

    expect(row.vex_fee_status).toBe("pending");
    expect(row.vex_fee_tx_hash).toBe("0xpendfee");
    expect(row.vex_fee_symbol).toBe("ETH");
    expect(row.vex_fee_amount_raw).toBeNull();
    expect(row.vex_fee_usd_est).toBeNull();
  });

  it("shows a failed fee with its status, and states no money for it", async () => {
    const row = rowBy(await feedPage(), "fail-action");

    expect(row.vex_fee_status).toBe("definitively_failed");
    expect(row.vex_fee_amount_raw).toBeNull();
    expect(row.vex_fee_usd_est).toBeNull();
  });

  it("reads the money from the retry that landed, not from the attempt that reverted", async () => {
    const row = rowBy(await feedPage(), "retry-action");

    expect(row.vex_fee_status).toBe("confirmed");
    expect(row.vex_fee_tx_hash).toBe("0xretryfee2");
    expect(row.vex_fee_amount_raw).toBe("23");
  });

  it("reports no fee at all when two fee legs both confirmed, rather than half the money", async () => {
    const row = rowBy(await feedPage(), "dbl-action");

    expect(row.vex_fee_status).toBeNull();
    expect(row.vex_fee_amount_raw).toBeNull();
    expect(row.vex_fee_tx_hash).toBeNull();
  });
});

describe("the verification summary", () => {
  // Every seeded row is verified_full. The summary must count the nine entries and none of the
  // eight fee legs, or the site's own verification figure contradicts every count beside it.
  it("counts the entries and none of the fee legs", async () => {
    const summary = await verificationSummary(db.pool);
    const feeLegs = LEGS.filter((leg) =>
      ["bridge_fee", "swap_fee", "trench_fee", "pools_fee", "vex_fee"].includes(leg.eventRole),
    );

    expect(summary.verifiedFull).toBe(LEGS.length - feeLegs.length);
    expect(feeLegs).toHaveLength(8);
  });
});
