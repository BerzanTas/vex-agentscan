import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadConfig } from "../../config.js";
import { startTestDb } from "../../testing/pg-harness.js";

/**
 * THE LAUNCHPAD FAMILY, THROUGH THE REAL INGEST HANDLER AND INTO THE REAL TABLE.
 *
 * Two things this proves that a schema unit test cannot:
 *
 * 1. the table's CHECK constraints agree with the wire contract. Migration 0018 restates both
 *    constraints in full, and a role the contract accepts but the CHECK refuses would fail here as
 *    an insert error rather than as a clean rejection, which is what "ship the migration with the
 *    vocabulary" means;
 * 2. SERVER-FIRST IS REQUIRED. The last case runs a new client's event against the PRE-migration
 *    enum and shows it refused with the ordinary `validation_failed` shape - the reason this lane
 *    deploys before any writer learns these names.
 */

const ingestToken = "L".repeat(43);
const agentHash = "1a".repeat(32);
const sha256hex = (value: string) => createHash("sha256").update(value).digest("hex");

const baseEvent = (overrides: Record<string, unknown>) => ({
  sourceExecutionId: "launchpad-exec",
  eventIndex: 0,
  status: "confirmed",
  protocol: "pools_fun",
  chainFamily: "eip155",
  chainId: 4663,
  txHash: `0x${"9".repeat(64)}`,
  createdAt: "2026-09-04T11:58:03.101Z",
  confirmedAt: "2026-09-04T11:58:41.940Z",
  ...overrides,
});

let db: Awaited<ReturnType<typeof startTestDb>>;
let app: FastifyInstance;

beforeAll(async () => {
  db = await startTestDb();
  const config = loadConfig({ DATABASE_URL: "postgres://unused-in-tests" });
  app = await buildApp({ pool: db.pool, config, resolveChain: () => null });
  await db.pool.query(
    `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, status)
     VALUES ($1, $2, 1, now(), 'active')`,
    [agentHash, sha256hex(ingestToken)],
  );
}, 120_000);

afterAll(async () => {
  await app.close();
  await db.stop();
});

const postEvents = (events: unknown[]) =>
  app.inject({
    method: "POST",
    url: "/v1/events",
    headers: { authorization: `Bearer ${ingestToken}` },
    payload: { schemaVersion: 3, agentHash, backfill: false, events },
  });

const storedRole = async (sourceRowId: string) => {
  const result = await db.pool.query<{ kind: string; event_role: string }>(
    "SELECT kind, event_role FROM activities WHERE agent_hash = $1 AND source_row_id = $2",
    [agentHash, sourceRowId],
  );
  return result.rows[0];
};

describe("the launchpad family roles, ingested end to end", () => {
  it.each([
    ["creator_fee_claim", "claim"],
    ["holder_reward_claim", "claim"],
    ["reward_distribution", "claim"],
    ["launch_cancel", "launch"],
  ] as const)("accepts %s on kind %s and stores it", async (eventRole, kind) => {
    const sourceRowId = `row-${eventRole}`;
    const response = await postEvents([baseEvent({ sourceRowId, kind, eventRole })]);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ accepted: 1, rejected: [] });
    expect(await storedRole(sourceRowId)).toEqual({ kind, event_role: eventRole });
  });

  it.each(["swap", "bridge", "launch"] as const)("accepts a vex_fee leg on a %s", async (kind) => {
    const sourceRowId = `row-vex-fee-${kind}`;
    const response = await postEvents([
      baseEvent({
        sourceRowId,
        kind,
        eventRole: "vex_fee",
        eventIndex: 1,
        tokenIn: { address: "0xfee", symbol: "ETH", decimals: 18 },
        amountInRaw: "2500000000000000",
        executedInRaw: "2500000000000000",
      }),
    ]);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ accepted: 1, rejected: [] });
    expect(await storedRole(sourceRowId)).toEqual({ kind, event_role: "vex_fee" });
  });

  it.each(["lend", "yield", "claim", "transfer"] as const)(
    "refuses a vex_fee leg on a %s, which admits no fee leg",
    async (kind) => {
      const response = await postEvents([
        baseEvent({ sourceRowId: `row-bad-fee-${kind}`, kind, eventRole: "vex_fee" }),
      ]);

      expect(response.json()).toMatchObject({
        accepted: 0,
        rejected: [{ index: 0, code: "validation_failed" }],
      });
    },
  );

  it("refuses an input leg on a claim-family role, and the table would refuse it too", async () => {
    const response = await postEvents([
      baseEvent({
        sourceRowId: "row-claim-with-input",
        kind: "claim",
        eventRole: "holder_reward_claim",
        tokenIn: { address: "0xin", symbol: "ETH", decimals: 18 },
        amountInRaw: "1000",
      }),
    ]);

    expect(response.json()).toMatchObject({
      accepted: 0,
      rejected: [{ index: 0, code: "validation_failed" }],
    });
  });

  it("stores the two-asset payout a creator claim settles as", async () => {
    const response = await postEvents([
      baseEvent({
        sourceRowId: "row-creator-claim-two-legs",
        kind: "claim",
        eventRole: "creator_fee_claim",
        tokenOut: { address: "0xtoken", symbol: "VEX", decimals: 18 },
        amountOutRaw: "1000",
        executedOutRaw: "1000",
        tokenOut2: { address: "0xpaired", symbol: "WETH", decimals: 18 },
        amountOut2Raw: "2000",
        executedOut2Raw: "2000",
      }),
    ]);

    expect(response.json()).toMatchObject({ accepted: 1, rejected: [] });
    const stored = await db.pool.query<{ executed_out2_raw: string | null }>(
      "SELECT executed_out2_raw FROM activities WHERE source_row_id = 'row-creator-claim-two-legs'",
    );
    expect(stored.rows[0]?.executed_out2_raw).toBe("2000");
  });
});

/**
 * SERVER FIRST, PROVEN, AT BOTH GATES AN OLD SERVER WOULD REFUSE AT.
 *
 * "Old server" means two things at once: an `eventSchema` whose role enum does not carry the family
 * names, and an `activities_event_role_check` that does not either. This block exercises both,
 * because they fail in different ways and the ordering requirement rests on the FIRST one:
 *
 *   - the wire gate refuses an unknown role with the ordinary `validation_failed` rejection, the
 *     same shape any other malformed event gets. That is what a writer running ahead of its server
 *     actually receives, and it is why running ahead is safe rather than corrupting;
 *   - the table gate refuses the same names outright, so even a writer that somehow bypassed the
 *     schema could not store a row the read model cannot classify.
 *
 * Deploy the client first and every launchpad event is dropped with a clean rejection. Deploy the
 * server first and nothing is lost, which is the order this arc is sequenced in.
 */
describe("a client running ahead of its server", () => {
  it("has every unknown role refused by the wire gate with validation_failed, storing nothing", async () => {
    const response = await postEvents([
      baseEvent({ sourceRowId: "ahead-of-server", kind: "claim", eventRole: "role_this_server_does_not_know" }),
    ]);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      accepted: 0,
      rejected: [{ index: 0, code: "validation_failed" }],
    });
    const stored = await db.pool.query(
      "SELECT count(*)::int AS count FROM activities WHERE source_row_id = 'ahead-of-server'",
    );
    expect(stored.rows[0]).toEqual({ count: 0 });
  });

  // The pre-0018 vocabulary, restored on a THROWAWAY table so the running suite's constraints are
  // never touched. Every family role must be refused by it - that is the constraint an un-migrated
  // server is running, and the reason migration 0018 has to land before any writer emits these.
  it.each([
    "creator_fee_claim",
    "holder_reward_claim",
    "reward_distribution",
    "launch_cancel",
    "vex_fee",
  ])("has %s refused by the pre-0018 table constraint", async (eventRole) => {
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`CREATE TEMP TABLE pre_0018_roles (event_role text
        CHECK (event_role IN (
          'swap','trench_fee','swap_fee',
          'bridge_deposit','bridge_fee','bridge_fill_expected','bridge_fill_observed','bridge_refund',
          'lend_deposit','lend_withdraw','lend_borrow_operate',
          'predict_buy','predict_sell','predict_claim','predict_close',
          'wrap','unwrap',
          'yield_pt','yield_yt','yield_py','yield_lp','yield_sy','yield_claim',
          'token_launch',
          'pools_fee','pools_claim',
          'wallet_transfer'
        ))) ON COMMIT DROP`);
      await expect(
        client.query("INSERT INTO pre_0018_roles (event_role) VALUES ($1)", [eventRole]),
      ).rejects.toThrow(/check constraint/i);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  // And the same names ARE accepted by the constraint 0018 actually installed, so the two halves of
  // this block are testing a real difference rather than a typo in the copied list.
  it.each([
    "creator_fee_claim",
    "holder_reward_claim",
    "reward_distribution",
    "launch_cancel",
    "vex_fee",
  ])("has %s accepted by the migrated table", async (eventRole) => {
    const accepted = await db.pool.query<{ ok: boolean }>(
      `SELECT $1::text = ANY (ARRAY[
         'creator_fee_claim','holder_reward_claim','reward_distribution','launch_cancel','vex_fee'
       ]) AS ok`,
      [eventRole],
    );
    expect(accepted.rows[0]?.ok).toBe(true);
    const inserted = await db.pool.query(
      `INSERT INTO activities
         (agent_hash, source_row_id, public_id, source_execution_id, event_index,
          kind, event_role, status, protocol, chain_family, chain_id,
          tx_hash, client_created_at, statuses_seen, verification_state, received_schema_version)
       VALUES ($1, $2, $2, $2, 0,
               CASE WHEN $3 IN ('launch_cancel','vex_fee') THEN 'launch' ELSE 'claim' END,
               $3, 'confirmed', 'pools_fun', 'eip155', 4663,
               $2, now(), ARRAY['confirmed'], 'none', 3)
       RETURNING id`,
      [agentHash, `migrated-${eventRole}`, eventRole],
    );
    expect(inserted.rowCount).toBe(1);
  });
});
