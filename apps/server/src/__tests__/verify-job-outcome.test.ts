import { describe, expect, it } from "vitest";
import { resolveJobOutcome } from "../worker/verify-job.js";
import type { ClaimedJob } from "../repos/activities-verify-repo.js";
import { loadConfig } from "../config.js";

const config = loadConfig({ DATABASE_URL: "postgres://unused" });

function jobFixture(overrides: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    activityId: 1n,
    attempts: 0,
    firstAttemptAt: new Date("2026-08-04T10:00:00Z"),
    txHash: "0xabc",
    protocol: "kyberswap",
    chainFamily: "eip155",
    chainId: 8453n,
    clientConfirmedAt: new Date("2026-08-04T10:00:00Z"),
    executedInRaw: null,
    executedOutRaw: null,
    tokenInAddress: null,
    tokenOutAddress: null,
    ...overrides,
  };
}

describe("resolveJobOutcome", () => {
  it("zwraca close_unverifiable gdy brak tx_hash", async () => {
    const outcome = await resolveJobOutcome(jobFixture({ txHash: null }), {
      config,
      resolveChain: () => ({
        canonicalSlug: "base",
        displayName: "Base",
        explorerTxUrl: () => null,
        rpcUrls: [],
        verificationTier: "full",
      }),
      chainReaderFor: () => ({ getReceipt: async () => null }),
    });
    expect(outcome).toEqual({ kind: "close_unverifiable" });
  });

  it("zwraca reschedule z backoffem gdy sieci nie ma w rejestrze", async () => {
    const outcome = await resolveJobOutcome(jobFixture(), {
      config,
      resolveChain: () => null,
      chainReaderFor: () => ({ getReceipt: async () => null }),
    });
    expect(outcome).toEqual({
      kind: "reschedule",
      delayMs: config.UNKNOWN_CHAIN_BACKOFF_MIN * 60_000,
      lastError: "chain_not_in_registry",
    });
  });

  it("nie dotyka bazy podczas rozstrzygania", async () => {
    const outcome = await resolveJobOutcome(jobFixture(), {
      config,
      resolveChain: () => ({
        canonicalSlug: "base",
        displayName: "Base",
        explorerTxUrl: () => null,
        rpcUrls: [],
        verificationTier: "full",
      }),
      chainReaderFor: () => ({
        getReceipt: async () => {
          throw new Error("rpc down");
        },
      }),
    });
    expect(outcome.kind).toBe("reschedule");
  });
});
