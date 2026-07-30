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
import {
  closeUnverifiable,
  finalizeVerification,
  rescheduleJob,
  type ClaimedJob,
  type SqlExecutor,
} from "../repos/activities-verify-repo.js";

export type ChainReaderContext = { clientConfirmedAt: Date | null };

export type VerifyJobDeps = {
  config: Config;
  resolveChain: ResolveChain;
  chainReaderFor: (entry: ChainEntry, context: ChainReaderContext) => ChainReader;
};

type ReceiptRead =
  | { outcome: "receipt"; receipt: ReceiptView }
  | { outcome: "not_found" }
  | { outcome: "error"; message: string };

export async function runVerifyJob(client: SqlExecutor, job: ClaimedJob, deps: VerifyJobDeps): Promise<void> {
  const entry = deps.resolveChain({ protocol: job.protocol, chainFamily: job.chainFamily, chainId: job.chainId });
  if (entry === null) {
    await rescheduleJob(client, job.activityId, deps.config.UNKNOWN_CHAIN_BACKOFF_MIN * 60_000, "chain_not_in_registry");
    return;
  }
  if (job.txHash === null) {
    await closeUnverifiable(client, job.activityId);
    return;
  }
  const reader = deps.chainReaderFor(entry, { clientConfirmedAt: job.clientConfirmedAt });
  const read = await readReceipt(reader, job.txHash);
  const verdict = verdictFrom(read, job, entry, deps.config, job.txHash);
  if (verdict.result !== "retry") {
    await finalizeVerification(client, job.activityId, verdict, deps.config);
    return;
  }
  const backoff = nextBackoff({
    attempts: job.attempts,
    schedule: deps.config.VERIFY_BACKOFF_SCHEDULE,
    firstAttemptAt: job.firstAttemptAt,
    maxAgeDays: deps.config.VERIFY_MAX_AGE_DAYS,
    now: new Date(),
  });
  if ("delayMs" in backoff) {
    await rescheduleJob(client, job.activityId, backoff.delayMs, verdict.error);
    return;
  }
  if (read.outcome === "not_found") {
    await finalizeVerification(client, job.activityId, { result: "strike", reason: "tx_not_found" }, deps.config);
    return;
  }
  await closeUnverifiable(client, job.activityId);
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
