import { pino } from "pino";
import { encodeAbiParameters, parseAbiParameters, toEventSelector, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import type { AttestationChainRegistry, ChainReader } from "@agentscan/core";
import { loadConfig } from "../../config.js";
import type { ClaimedAttestation } from "../../repos/token-attestations-verify-repo.js";
import { resolveWithConcurrency, type AttestationResolverDeps } from "../attestation-loop.js";

const factoryAddress = "0x3857c6c4fe93abb40945dfc8b9d690384cbae014";
const claimedToken = `0x${"a".repeat(40)}`;
const recoveredSigner = `0x${"c".repeat(40)}`;
const validTxHash = `0x${"1".repeat(64)}`;
const throwingChainId = 999999n;

const TOKEN_CREATED_TOPIC0 = toEventSelector("TokenCreated(address,address,uint8,uint8,bytes,uint256)");
const TOKEN_CREATED_PARAMS = parseAbiParameters(
  "address token, address creator, uint8 strategy, uint8 dex, bytes data, uint256 price",
);

function tokenCreatedLog() {
  const data = encodeAbiParameters(TOKEN_CREATED_PARAMS, [claimedToken as Hex, recoveredSigner as Hex, 0, 0, "0x", 1n]);
  return { address: factoryAddress, topics: [TOKEN_CREATED_TOPIC0], data };
}

const chainEntry = {
  canonicalSlug: "robinhood",
  displayName: "Robinhood Chain",
  explorerTxUrl: () => null,
  rpcUrls: [],
  verificationTier: "full" as const,
};

const workingReader: ChainReader = {
  getReceipt: async () => ({
    status: "success",
    blockTimestamp: new Date(),
    blockNumber: 100n,
    erc20Transfers: [],
    transactionValueRaw: null,
    logs: [tokenCreatedLog()],
  }),
  getHeadBlockNumber: async () => 105n,
};

function jobFixture(id: string, chainId: bigint): ClaimedAttestation {
  return {
    id,
    chainId,
    tokenAddress: claimedToken,
    recoveredSigner,
    txHashHint: validTxHash,
    attemptCount: 0,
    firstSeenAt: new Date("2026-08-04T10:00:00Z"),
  };
}

function depsFixture(): AttestationResolverDeps {
  const config = loadConfig({ DATABASE_URL: "postgres://unused", ATTEST_BACKOFF_SCHEDULE: "1m,5m" });
  const chainRegistry: AttestationChainRegistry = new Map([[4663n, { factoryAddresses: [factoryAddress] }]]);
  return {
    config,
    now: () => new Date("2026-08-04T11:00:00Z"),
    resolveChain: (key) => {
      if (key.chainId === throwingChainId) throw new Error("resolveChain exploded unexpectedly");
      return chainEntry;
    },
    chainReaderFor: () => workingReader,
    chainRegistry,
    logger: pino({ level: "silent" }),
  };
}

describe("resolveWithConcurrency", () => {
  it("contains one job's unexpected throw to a reschedule outcome, without discarding the batch's other outcomes", async () => {
    const jobs = [jobFixture("job-1", 4663n), jobFixture("job-2", throwingChainId), jobFixture("job-3", 4663n)];

    const resolved = await resolveWithConcurrency(jobs, 3, depsFixture());

    expect(resolved).toHaveLength(3);
    const outcomeById = new Map(resolved.map((entry) => [entry.job.id, entry.outcome]));
    expect(outcomeById.get("job-1")).toEqual({ kind: "finalize_verified", derivedTxHash: validTxHash });
    expect(outcomeById.get("job-3")).toEqual({ kind: "finalize_verified", derivedTxHash: validTxHash });
    expect(outcomeById.get("job-2")).toEqual({ kind: "reschedule", delayMs: 60_000 });
  });
});
