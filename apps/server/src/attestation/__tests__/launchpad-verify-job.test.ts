import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildAttestationChainRegistry,
  type ChainEntry,
  type ChainReader,
  type ReceiptLog,
} from "@agentscan/core";
import { loadConfig } from "../../config.js";
import type { ClaimedAttestation } from "../../repos/token-attestations-verify-repo.js";
import { resolveAttestationOutcome, type AttestationVerifyDeps } from "../verify-job.js";

/**
 * The whole attestation job, driven over the REAL receipts of the two launches made on 2026-09-04
 * and one real pools.fun V3 launch by another creator (`fixtures/README.md`). These are the cases a
 * hand-made log cannot prove: that the real bytes decode, that the allowlist matches the address the
 * real transaction was sent to, and that the keeper's real `launch()` cannot stand in for a
 * creator's proof.
 */
type ReceiptFixture = {
  txHash: string;
  status: "success" | "reverted";
  blockNumber: string;
  transactionFrom: string;
  transactionTo: string | null;
  logs: ReceiptLog[];
};

function fixture(name: string): ReceiptFixture {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)), "utf8"),
  ) as ReceiptFixture;
}

const config = loadConfig({ DATABASE_URL: "postgres://unused", ATTEST_BACKOFF_SCHEDULE: "1m,5m" });
const chainRegistry = buildAttestationChainRegistry(new Map());

const chainEntry: ChainEntry = {
  canonicalSlug: "robinhood",
  chainFamily: "eip155",
  displayName: "Robinhood Chain",
  explorerTxUrl: () => null,
  rpcUrls: [],
  verificationTier: "full",
};

/** Head far enough past the fixture's block that confirmations are never the reason for a verdict. */
function readerFor(receipt: ReceiptFixture): ChainReader {
  return {
    getReceipt: async () => ({
      status: receipt.status,
      blockTimestamp: new Date("2026-09-04T13:00:00Z"),
      blockNumber: BigInt(receipt.blockNumber),
      erc20Transfers: [],
      transactionValueRaw: null,
      transactionFrom: receipt.transactionFrom,
      transactionTo: receipt.transactionTo,
      logs: receipt.logs,
    }),
    getHeadBlockNumber: async () => BigInt(receipt.blockNumber) + 100n,
  };
}

function depsFor(receipt: ReceiptFixture): AttestationVerifyDeps {
  return {
    config,
    now: () => new Date("2026-09-04T18:00:00Z"),
    resolveChain: () => chainEntry,
    chainReaderFor: () => readerFor(receipt),
    chainRegistry,
  };
}

function job(overrides: Partial<ClaimedAttestation>): ClaimedAttestation {
  return {
    id: "1",
    chainId: 4663n,
    launchpad: "trench",
    tokenAddress: `0x${"a".repeat(40)}`,
    recoveredSigner: `0x${"c".repeat(40)}`,
    txHashHint: null,
    attemptCount: 0,
    firstSeenAt: new Date("2026-09-04T17:00:00Z"),
    ...overrides,
  };
}

const poolsLaunch = fixture("pools-v3-gateway-launch");
const virtualsPreLaunch = fixture("virtuals-robinhood-prelaunch");
const keeperLaunch = fixture("virtuals-base-keeper-launch");

const POOLS_LAUNCHER = "0x848e5738fd6f7fb4a7a7141702edcde4b8ad2450";
const POOLS_TOKEN = "0x00e802805a16ad3aa879f98f21a1213545bb98b9";
const VIRTUALS_CREATOR = "0x33ef6673bd80cb11fcc41b82bc2181e65cc4d2fa";
const VIRTUALS_TOKEN = "0xd1ef7097c42d2a94033148aec7ca70235dcdc411";
const BASE_AGENT_TOKEN = "0x84a0326c64d9f0e1f640062638807722e1dde87f";
const BASE_KEEPER = "0x81f7ca6af86d1ca6335e44a2c28bc88807491415";

describe("a pools.fun attestation against the real V3 gateway launch", () => {
  const poolsJob = (overrides: Partial<ClaimedAttestation> = {}) =>
    job({
      launchpad: "pools_fun",
      tokenAddress: POOLS_TOKEN,
      recoveredSigner: POOLS_LAUNCHER,
      txHashHint: poolsLaunch.txHash,
      ...overrides,
    });

  it("verifies the launcher who signed it", async () => {
    expect(await resolveAttestationOutcome(poolsJob(), depsFor(poolsLaunch))).toEqual({
      kind: "finalize_verified",
      derivedTxHash: poolsLaunch.txHash,
    });
  });

  it("refuses anyone else who points at the same launch", async () => {
    const outcome = await resolveAttestationOutcome(
      poolsJob({ recoveredSigner: `0x${"e".repeat(40)}` }),
      depsFor(poolsLaunch),
    );
    expect(outcome).toEqual({ kind: "finalize_mismatch", detail: "creator_mismatch" });
  });

  // The launchpad is part of the claim, so claiming the wrong one over a real receipt finds
  // nothing rather than quietly matching whatever decoder happens to fit.
  it("refuses the same receipt claimed as a Trench launch", async () => {
    const outcome = await resolveAttestationOutcome(poolsJob({ launchpad: "trench" }), depsFor(poolsLaunch));
    expect(outcome).toEqual({ kind: "finalize_mismatch", detail: "wrong_token" });
  });
});

describe("a Virtuals attestation against the real creator preLaunch", () => {
  const virtualsJob = (overrides: Partial<ClaimedAttestation> = {}) =>
    job({
      launchpad: "virtuals",
      tokenAddress: VIRTUALS_TOKEN,
      recoveredSigner: VIRTUALS_CREATOR,
      txHashHint: virtualsPreLaunch.txHash,
      ...overrides,
    });

  it("verifies the creator who sent the preLaunch", async () => {
    expect(await resolveAttestationOutcome(virtualsJob(), depsFor(virtualsPreLaunch))).toEqual({
      kind: "finalize_verified",
      derivedTxHash: virtualsPreLaunch.txHash,
    });
  });

  it("refuses anyone else pointing at the creator's transaction", async () => {
    const outcome = await resolveAttestationOutcome(
      virtualsJob({ recoveredSigner: BASE_KEEPER }),
      depsFor(virtualsPreLaunch),
    );
    expect(outcome).toEqual({ kind: "finalize_mismatch", detail: "tx_sender_mismatch" });
  });

  it("refuses a different token claimed against the same preLaunch", async () => {
    const outcome = await resolveAttestationOutcome(
      virtualsJob({ tokenAddress: BASE_AGENT_TOKEN }),
      depsFor(virtualsPreLaunch),
    );
    expect(outcome).toEqual({ kind: "finalize_mismatch", detail: "wrong_token" });
  });

  // Robinhood's BondingV5 is not Base's. Pointing a chain-4663 claim at the Base contract must
  // fail, or the per-(chain, launchpad) allowlist would be decoration.
  it("refuses the Base BondingV5 receipt under a Robinhood claim", async () => {
    const outcome = await resolveAttestationOutcome(
      virtualsJob({ tokenAddress: BASE_AGENT_TOKEN, recoveredSigner: BASE_KEEPER }),
      depsFor(keeperLaunch),
    );
    expect(outcome).toEqual({ kind: "finalize_mismatch", detail: "wrong_token" });
  });
});

/**
 * THE KEEPER TRANSACTION IS NOT A CREATOR PROOF. This is the defect the whole `creator_transaction`
 * mode exists to prevent: `Launched` is emitted from the keeper's own `launch()`, sent to the same
 * allowlisted BondingV5 as the creator's `preLaunch`, so only refusing to decode it - and refusing
 * the sender - keeps the keeper from being able to attest every agent on the protocol.
 */
describe("the real Base keeper launch, submitted as a creator proof", () => {
  const baseJob = (overrides: Partial<ClaimedAttestation> = {}) =>
    job({
      chainId: 8453n,
      launchpad: "virtuals",
      tokenAddress: BASE_AGENT_TOKEN,
      recoveredSigner: BASE_KEEPER,
      txHashHint: keeperLaunch.txHash,
      ...overrides,
    });

  it("refuses the keeper itself, because Launched is never decoded as a creation", async () => {
    expect(await resolveAttestationOutcome(baseJob(), depsFor(keeperLaunch))).toEqual({
      kind: "finalize_mismatch",
      detail: "wrong_token",
    });
  });

  it("refuses the real creator too, when they point at the keeper's transaction", async () => {
    const outcome = await resolveAttestationOutcome(
      baseJob({ recoveredSigner: VIRTUALS_CREATOR }),
      depsFor(keeperLaunch),
    );
    expect(outcome).toEqual({ kind: "finalize_mismatch", detail: "wrong_token" });
  });
});

describe("an unreadable transaction envelope", () => {
  // Missing evidence is not counter-evidence: an RPC that served the receipt but not the
  // transaction must reschedule, never terminalize an honest attestation as a mismatch.
  it("reschedules a Virtuals claim rather than terminalizing it", async () => {
    const withoutEnvelope: AttestationVerifyDeps = {
      ...depsFor(virtualsPreLaunch),
      chainReaderFor: () => ({
        getReceipt: async () => ({
          status: "success" as const,
          blockTimestamp: new Date("2026-09-04T13:00:00Z"),
          blockNumber: BigInt(virtualsPreLaunch.blockNumber),
          erc20Transfers: [],
          transactionValueRaw: null,
          logs: virtualsPreLaunch.logs,
        }),
        getHeadBlockNumber: async () => BigInt(virtualsPreLaunch.blockNumber) + 100n,
      }),
    };
    const outcome = await resolveAttestationOutcome(
      job({
        launchpad: "virtuals",
        tokenAddress: VIRTUALS_TOKEN,
        recoveredSigner: VIRTUALS_CREATOR,
        txHashHint: virtualsPreLaunch.txHash,
      }),
      withoutEnvelope,
    );
    expect(outcome).toEqual({ kind: "reschedule", delayMs: 60_000 });
  });
});
