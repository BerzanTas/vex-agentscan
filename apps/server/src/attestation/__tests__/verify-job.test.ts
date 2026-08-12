import { encodeAbiParameters, parseAbiParameters, toEventSelector, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import type { AttestationChainRegistry, ChainReader } from "@agentscan/core";
import { loadConfig } from "../../config.js";
import type { ClaimedAttestation } from "../../repos/token-attestations-verify-repo.js";
import { resolveAttestationOutcome, type AttestationVerifyDeps } from "../verify-job.js";

const config = loadConfig({ DATABASE_URL: "postgres://unused", ATTEST_BACKOFF_SCHEDULE: "1m,5m" });
const now = () => new Date("2026-08-04T11:00:00Z");

const factoryAddress = "0x3857c6c4fe93abb40945dfc8b9d690384cbae014";
const claimedToken = `0x${"a".repeat(40)}`;
const recoveredSigner = `0x${"c".repeat(40)}`;
const otherSigner = `0x${"d".repeat(40)}`;
const validTxHash = `0x${"1".repeat(64)}`;

const TOKEN_CREATED_TOPIC0 = toEventSelector("TokenCreated(address,address,uint8,uint8,bytes,uint256)");
const TOKEN_CREATED_PARAMS = parseAbiParameters(
  "address token, address creator, uint8 strategy, uint8 dex, bytes data, uint256 price",
);

function tokenCreatedLog(overrides: { address?: string; token?: string; creator?: string } = {}) {
  const data = encodeAbiParameters(TOKEN_CREATED_PARAMS, [
    (overrides.token ?? claimedToken) as Hex,
    (overrides.creator ?? recoveredSigner) as Hex,
    0,
    0,
    "0x",
    1n,
  ]);
  return { address: overrides.address ?? factoryAddress, topics: [TOKEN_CREATED_TOPIC0], data };
}

function jobFixture(overrides: Partial<ClaimedAttestation> = {}): ClaimedAttestation {
  return {
    id: "1",
    chainId: 4663n,
    tokenAddress: claimedToken,
    recoveredSigner,
    txHashHint: validTxHash,
    attemptCount: 0,
    firstSeenAt: new Date("2026-08-04T10:00:00Z"),
    ...overrides,
  };
}

const chainEntry = {
  canonicalSlug: "robinhood",
  chainFamily: "eip155" as const,
  displayName: "Robinhood Chain",
  explorerTxUrl: () => null,
  rpcUrls: [],
  verificationTier: "full" as const,
};

const registryWithFactory: AttestationChainRegistry = new Map([[4663n, { factoryAddresses: [factoryAddress] }]]);

function depsFixture(overrides: Partial<AttestationVerifyDeps> = {}): AttestationVerifyDeps {
  return {
    config,
    now,
    resolveChain: () => chainEntry,
    chainReaderFor: () => ({ getReceipt: async () => null }),
    chainRegistry: registryWithFactory,
    ...overrides,
  };
}

describe("resolveAttestationOutcome", () => {
  it("reschedules with the first backoff interval when the hint is missing", async () => {
    const outcome = await resolveAttestationOutcome(jobFixture({ txHashHint: null }), depsFixture());
    expect(outcome).toEqual({ kind: "reschedule", delayMs: 60_000 });
  });

  it("terminalizes unverifiable once a missing hint has aged past ATTEST_MAX_AGE_DAYS", async () => {
    const outcome = await resolveAttestationOutcome(
      jobFixture({ txHashHint: null, firstSeenAt: new Date("2026-07-01T00:00:00Z") }),
      depsFixture({ now: () => new Date("2026-08-20T00:00:00Z") }),
    );
    expect(outcome).toEqual({ kind: "terminalize_unverifiable" });
  });

  it("reschedules when the reader throws an RPC error, never a terminal verdict", async () => {
    const reader: ChainReader = {
      getReceipt: async () => {
        throw new Error("rpc down");
      },
    };
    const outcome = await resolveAttestationOutcome(jobFixture(), depsFixture({ chainReaderFor: () => reader }));
    expect(outcome).toEqual({ kind: "reschedule", delayMs: 60_000 });
  });

  it("reschedules when the receipt is not yet found", async () => {
    const reader: ChainReader = { getReceipt: async () => null };
    const outcome = await resolveAttestationOutcome(jobFixture(), depsFixture({ chainReaderFor: () => reader }));
    expect(outcome).toEqual({ kind: "reschedule", delayMs: 60_000 });
  });

  it("reschedules below the minimum confirmation depth, never a terminal verdict at depth 0", async () => {
    const reader: ChainReader = {
      getReceipt: async () => ({
        status: "success",
        blockTimestamp: new Date(),
        blockNumber: 100n,
        erc20Transfers: [],
        logs: [tokenCreatedLog()],
      }),
      getHeadBlockNumber: async () => 100n,
    };
    const outcome = await resolveAttestationOutcome(jobFixture(), depsFixture({ chainReaderFor: () => reader }));
    expect(outcome).toEqual({ kind: "reschedule", delayMs: 60_000 });
  });

  it("finalizes verified with the derived hash on the happy path", async () => {
    const reader: ChainReader = {
      getReceipt: async () => ({
        status: "success",
        blockTimestamp: new Date(),
        blockNumber: 100n,
        erc20Transfers: [],
        logs: [tokenCreatedLog()],
      }),
      getHeadBlockNumber: async () => 105n,
    };
    const outcome = await resolveAttestationOutcome(jobFixture(), depsFixture({ chainReaderFor: () => reader }));
    expect(outcome).toEqual({ kind: "finalize_verified", derivedTxHash: validTxHash });
  });

  it("finalizes mismatch tx_reverted when the receipt reverted", async () => {
    const reader: ChainReader = {
      getReceipt: async () => ({
        status: "reverted",
        blockTimestamp: new Date(),
        blockNumber: 100n,
        erc20Transfers: [],
        logs: [],
      }),
      getHeadBlockNumber: async () => 105n,
    };
    const outcome = await resolveAttestationOutcome(jobFixture(), depsFixture({ chainReaderFor: () => reader }));
    expect(outcome).toEqual({ kind: "finalize_mismatch", detail: "tx_reverted" });
  });

  it("finalizes mismatch wrong_token when no creation event names the claimed token", async () => {
    const reader: ChainReader = {
      getReceipt: async () => ({
        status: "success",
        blockTimestamp: new Date(),
        blockNumber: 100n,
        erc20Transfers: [],
        logs: [tokenCreatedLog({ token: `0x${"b".repeat(40)}` })],
      }),
      getHeadBlockNumber: async () => 105n,
    };
    const outcome = await resolveAttestationOutcome(jobFixture(), depsFixture({ chainReaderFor: () => reader }));
    expect(outcome).toEqual({ kind: "finalize_mismatch", detail: "wrong_token" });
  });

  it("finalizes mismatch creator_mismatch when the event's creator differs from the recovered signer", async () => {
    const reader: ChainReader = {
      getReceipt: async () => ({
        status: "success",
        blockTimestamp: new Date(),
        blockNumber: 100n,
        erc20Transfers: [],
        logs: [tokenCreatedLog({ creator: otherSigner })],
      }),
      getHeadBlockNumber: async () => 105n,
    };
    const outcome = await resolveAttestationOutcome(jobFixture(), depsFixture({ chainReaderFor: () => reader }));
    expect(outcome).toEqual({ kind: "finalize_mismatch", detail: "creator_mismatch" });
  });

  it("finalizes mismatch emitter_not_allowlisted when the matching event's emitter is untrusted", async () => {
    const reader: ChainReader = {
      getReceipt: async () => ({
        status: "success",
        blockTimestamp: new Date(),
        blockNumber: 100n,
        erc20Transfers: [],
        logs: [tokenCreatedLog({ address: "0x0000000000000000000000000000000000dead" })],
      }),
      getHeadBlockNumber: async () => 105n,
    };
    const outcome = await resolveAttestationOutcome(jobFixture(), depsFixture({ chainReaderFor: () => reader }));
    expect(outcome).toEqual({ kind: "finalize_mismatch", detail: "emitter_not_allowlisted" });
  });

  it("reschedules when the reader cannot report a head block number", async () => {
    const reader: ChainReader = {
      getReceipt: async () => ({
        status: "success",
        blockTimestamp: new Date(),
        blockNumber: 100n,
        erc20Transfers: [],
        logs: [tokenCreatedLog()],
      }),
    };
    const outcome = await resolveAttestationOutcome(jobFixture(), depsFixture({ chainReaderFor: () => reader }));
    expect(outcome).toEqual({ kind: "reschedule", delayMs: 60_000 });
  });

  it("reschedules an unresolvable chain, then terminalizes past the age cap", async () => {
    const deps = depsFixture({ resolveChain: () => null });
    const outcome = await resolveAttestationOutcome(jobFixture(), deps);
    expect(outcome).toEqual({ kind: "reschedule", delayMs: 60_000 });

    const aged = await resolveAttestationOutcome(
      jobFixture({ firstSeenAt: new Date("2026-07-01T00:00:00Z") }),
      depsFixture({ resolveChain: () => null, now: () => new Date("2026-08-20T00:00:00Z") }),
    );
    expect(aged).toEqual({ kind: "terminalize_unverifiable" });
  });
});
