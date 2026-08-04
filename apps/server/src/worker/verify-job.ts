import {
  evaluateVerification,
  nextBackoff,
  type ChainEntry,
  type ChainReader,
  type ReceiptView,
  type ResolveChain,
  type Verdict,
  type VerificationInput,
} from "@agentscan/core";
import type { Config } from "../config.js";
import type { ClaimedJob, SqlExecutor, TerminalVerdict } from "../repos/activities-verify-repo.js";
import { applyJobOutcome } from "./apply-outcome.js";

export type ChainReaderContext = {
  clientConfirmedAt: Date | null;
  executedInRaw: string | null;
  executedOutRaw: string | null;
  tokenInAddress: string | null;
  tokenOutAddress: string | null;
};

export type VerifyJobDeps = {
  config: Config;
  resolveChain: ResolveChain;
  chainReaderFor: (entry: ChainEntry, context: ChainReaderContext) => ChainReader;
};

export type JobOutcome =
  | { kind: "reschedule"; delayMs: number; lastError: string }
  | { kind: "close_unverifiable" }
  | { kind: "finalize"; verdict: TerminalVerdict };

type ReceiptRead =
  | { outcome: "receipt"; receipt: ReceiptView }
  | { outcome: "not_found" }
  | { outcome: "error"; message: string };

export async function runVerifyJob(client: SqlExecutor, job: ClaimedJob, deps: VerifyJobDeps): Promise<void> {
  await applyJobOutcome(client, job.activityId, await resolveJobOutcome(job, deps), deps.config);
}

export async function resolveJobOutcome(job: ClaimedJob, deps: VerifyJobDeps): Promise<JobOutcome> {
  const entry = deps.resolveChain({
    protocol: job.protocol,
    chainFamily: job.chainFamily,
    chainId: job.chainId,
  });
  if (entry === null) {
    return {
      kind: "reschedule",
      delayMs: deps.config.UNKNOWN_CHAIN_BACKOFF_MIN * 60_000,
      lastError: "chain_not_in_registry",
    };
  }
  if (job.txHash === null) return { kind: "close_unverifiable" };

  const reader = deps.chainReaderFor(entry, {
    clientConfirmedAt: job.clientConfirmedAt,
    executedInRaw: job.executedInRaw,
    executedOutRaw: job.executedOutRaw,
    tokenInAddress: job.tokenInAddress,
    tokenOutAddress: job.tokenOutAddress,
  });
  const read = await readReceipt(reader, job.txHash);
  const verdict = verdictFrom(read, job, entry, deps.config, job.txHash);
  if (verdict.result !== "retry") return { kind: "finalize", verdict };

  const backoff = nextBackoff({
    attempts: job.attempts,
    schedule: deps.config.VERIFY_BACKOFF_SCHEDULE,
    firstAttemptAt: job.firstAttemptAt,
    maxAgeDays: deps.config.VERIFY_MAX_AGE_DAYS,
    now: new Date(),
  });
  if ("delayMs" in backoff) {
    return { kind: "reschedule", delayMs: backoff.delayMs, lastError: verdict.error };
  }
  if (read.outcome === "not_found") {
    return { kind: "finalize", verdict: { result: "strike", reason: "tx_not_found" } };
  }
  return { kind: "close_unverifiable" };
}

async function readReceipt(reader: ChainReader, txHash: string): Promise<ReceiptRead> {
  try {
    const receipt = await reader.getReceipt(txHash);
    return receipt === null ? { outcome: "not_found" } : { outcome: "receipt", receipt };
  } catch (error) {
    return { outcome: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

function verdictFrom(read: ReceiptRead, job: ClaimedJob, entry: ChainEntry, config: Config, txHash: string): Verdict {
  if (read.outcome === "error") return { result: "retry", error: read.message };
  const receipt = read.outcome === "receipt" ? read.receipt : null;
  return evaluateVerification(receipt, verificationInputFrom(job, entry, config, txHash));
}

function verificationInputFrom(
  job: ClaimedJob,
  entry: ChainEntry,
  config: Config,
  txHash: string,
): VerificationInput {
  return {
    txHash,
    clientConfirmedAt: job.clientConfirmedAt,
    executedInRaw: job.executedInRaw,
    executedOutRaw: job.executedOutRaw,
    tokenInAddress: job.tokenInAddress,
    tokenOutAddress: job.tokenOutAddress,
    tier: entry.verificationTier,
    timeToleranceMin: config.VERIFY_TIME_TOLERANCE_MIN,
    amountTolerancePct: config.VERIFY_AMOUNT_TOLERANCE_PCT,
  };
}
