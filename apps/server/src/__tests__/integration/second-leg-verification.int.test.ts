import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveChain } from "@agentscan/core";
import { loadConfig } from "../../config.js";
import { toTxDetailDto } from "../../public-dto.js";
import { visibleActivityByPublicId } from "../../repos/read-repo.js";
import { verificationSummary } from "../../repos/verification-repo.js";
import { startTestDb } from "../../testing/pg-harness.js";
import { selectChainReader } from "../../verification/chain-reader-selection.js";
import { runVerificationPass } from "../../worker/loop.js";

/**
 * A TWO-ASSET SETTLEMENT, THROUGH THE REAL VERIFICATION WORKER AND OUT THE PUBLIC DTO.
 *
 * A Pendle split mints PT and YT in one transaction; a launchpad creator-fee or holder-reward claim
 * pays the launched token and the asset it was paired against. The claimed job now carries both
 * legs, so the verifier judges both, and the transaction DTO publishes the second one - which it
 * did not, so the page showed half of a two-asset settlement while wearing a `verified_full` badge
 * earned on the other half alone.
 */

const agentHash = "9c".repeat(32);

const confirmAllConfig = loadConfig({
  DATABASE_URL: "postgres://unused-in-tests",
  VERIFY_FAKE_MODE: "confirm_all",
});

const chainEntry = {
  canonicalSlug: "base",
  displayName: "Base",
  explorerTxUrl: (hash: string) => `https://basescan.org/tx/${hash}`,
  rpcUrls: [],
  verificationTier: "full" as const,
};

let db: Awaited<ReturnType<typeof startTestDb>>;

beforeAll(async () => {
  db = await startTestDb();
  await db.pool.query(
    `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, name, status)
     VALUES ($1, 'token-sha', 1, now(), 'Vex-legs-01', 'active')`,
    [agentHash],
  );
  const inserted = await db.pool.query<{ id: string }>(
    `INSERT INTO activities
       (agent_hash, source_row_id, public_id, source_execution_id, event_index, kind, event_role,
        status, protocol, chain_family, chain_id,
        token_in_address, token_in_symbol, token_in_decimals, amount_in_raw, executed_in_raw,
        token_out_address, token_out_symbol, token_out_decimals, amount_out_raw, executed_out_raw,
        token_out2_address, token_out2_symbol, token_out2_decimals, amount_out2_raw, executed_out2_raw,
        tx_hash, client_created_at, client_confirmed_at, statuses_seen,
        verification_state, received_schema_version)
     VALUES ($1, 'split', 'split', 'exec-split', 0, 'yield', 'yield_py',
             'confirmed', 'pendle', 'eip155', 8453,
             '0xsy00', 'SY-USDC', 6, '1000000', '1000000',
             '0xpt11', 'PT-USDC', 6, '2000000', '1999000',
             '0xyt22', 'YT-USDC', 6, '3000000', '2999000',
             '0xsplit', now() - interval '2 hours', now() - interval '1 hour', ARRAY['confirmed'],
             'queued', 3)
     RETURNING id`,
    [agentHash],
  );
  await db.pool.query(
    `INSERT INTO verification_jobs (activity_id, attempts, first_attempt_at, next_attempt_at)
     VALUES ($1, 0, now(), now() - interval '1 second')`,
    [inserted.rows[0]?.id],
  );
  await runVerificationPass({
    pool: db.pool,
    config: confirmAllConfig,
    now: () => new Date(),
    resolveChain,
    chainReaderFor: (entry, context) => selectChainReader(entry, confirmAllConfig, context),
    logger: pino({ level: "silent" }),
  });
}, 120_000);

afterAll(async () => {
  await db.stop();
});

describe("a two-asset settlement", () => {
  // The reader the pass runs through builds its transfers from the DECLARED legs, so a second leg
  // the claimed job failed to carry would appear undeclared and the row would not verify full.
  it("verifies at full tier with both payout legs declared", async () => {
    const row = await visibleActivityByPublicId(db.pool, "split");

    expect(row?.verification_state).toBe("verified_full");
  });

  it("publishes both payout legs on the transaction detail", async () => {
    const row = await visibleActivityByPublicId(db.pool, "split");
    if (row === null) throw new Error("the split row is missing");
    const detail = toTxDetailDto(row, () => chainEntry);

    expect(detail).toMatchObject({
      tokenOutSymbol: "PT-USDC",
      executedOutRaw: "1999000",
      tokenOut2Symbol: "YT-USDC",
      tokenOut2Decimals: 6,
      amountOut2Raw: "3000000",
      executedOut2Raw: "2999000",
    });
  });

  it("counts the settlement once in the verification summary, not once per leg", async () => {
    const summary = await verificationSummary(db.pool);

    expect(summary.verifiedFull).toBe(1);
  });
});
