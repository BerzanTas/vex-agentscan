import { describe, expect, it } from "vitest";
import { resolveJobOutcome } from "../worker/verify-job.js";
import type { ClaimedJob } from "../repos/activities-verify-repo.js";
import { loadConfig } from "../config.js";

const config = loadConfig({ DATABASE_URL: "postgres://unused" });
const now = () => new Date("2026-08-04T11:00:00Z");

function jobFixture(overrides: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    activityId: 1n,
    attempts: 0,
    firstAttemptAt: new Date("2026-08-04T10:00:00Z"),
    txHash: "0xabc",
    protocol: "kyberswap",
    chainFamily: "eip155",
    chainId: 8453n,
    kind: "swap",
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
      now,
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

  it("ponawia zadanie nieznanego łańcucha z backoffem, dopóki mieści się w oknie wieku", async () => {
    const outcome = await resolveJobOutcome(jobFixture(), {
      config,
      now,
      resolveChain: () => null,
      chainReaderFor: () => ({ getReceipt: async () => null }),
    });
    expect(outcome).toEqual({
      kind: "reschedule",
      delayMs: config.UNKNOWN_CHAIN_BACKOFF_MIN * 60_000,
      lastError: "chain_not_in_registry",
    });
  });

  it("zamyka zadanie nieznanego łańcucha po przekroczeniu VERIFY_MAX_AGE_DAYS", async () => {
    const outcome = await resolveJobOutcome(jobFixture(), {
      config,
      now: () => new Date("2026-08-20T10:00:01Z"),
      resolveChain: () => null,
      chainReaderFor: () => ({ getReceipt: async () => null }),
    });
    expect(outcome).toEqual({ kind: "close_unverifiable" });
  });

  it("zamienia rzucony wyjątek RPC w reschedule z backoffem, nigdy w strike", async () => {
    const outcome = await resolveJobOutcome(jobFixture(), {
      config,
      now,
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

  it("caps a launch job at verified_basic on a full-tier chain, skipping the amount check that would otherwise strike it", async () => {
    const blockTimestamp = new Date("2026-08-04T10:00:00Z");
    const outcome = await resolveJobOutcome(
      jobFixture({
        kind: "launch",
        tokenInAddress: "0xaaa",
        executedInRaw: "1000000",
      }),
      {
        config,
        now,
        resolveChain: () => ({
          canonicalSlug: "base",
          displayName: "Base",
          explorerTxUrl: () => null,
          rpcUrls: [],
          verificationTier: "full",
        }),
        chainReaderFor: () => ({
          getReceipt: async () => ({
            status: "success",
            blockTimestamp,
            erc20Transfers: [],
          }),
        }),
      },
    );
    expect(outcome).toEqual({ kind: "finalize", verdict: { result: "verified_basic", blockTimestamp } });
  });
});
