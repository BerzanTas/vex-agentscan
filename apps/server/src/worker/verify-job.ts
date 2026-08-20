import {
  evaluateVerification,
  nextBackoff,
  resolveVerificationTier,
  type ChainEntry,
  type ChainReader,
  type MissingReceiptCorroboration,
  type ReceiptView,
  type ResolveChain,
  type Verdict,
  type VerificationInput,
} from "@agentscan/core";
import type { Config } from "../config.js";
import type { ClaimedJob, TerminalVerdict } from "../repos/activities-verify-repo.js";

export type ChainReaderContext = {
  clientConfirmedAt: Date | null;
  executedInRaw: string | null;
  executedOutRaw: string | null;
  tokenInAddress: string | null;
  tokenOutAddress: string | null;
};

export type VerifyJobDeps = {
  config: Config;
  now: () => Date;
  resolveChain: ResolveChain;
  chainReaderFor: (entry: ChainEntry, context: ChainReaderContext) => ChainReader;
};

export type ObservedLeg = { token: string; from: string; to: string; amountRaw: string };

export type StrikeObservation = {
  transactionValueRaw: string | null;
  declaredTokenTransfers: ObservedLeg[];
};

export type JobOutcome =
  | { kind: "reschedule"; delayMs: number; lastError: string }
  | { kind: "close_unverifiable" }
  | { kind: "finalize"; verdict: TerminalVerdict; observed?: StrikeObservation };

export type ReceiptRead =
  | { outcome: "receipt"; receipt: ReceiptView }
  | { outcome: "not_found" }
  | { outcome: "error"; message: string };

export async function resolveJobOutcome(job: ClaimedJob, deps: VerifyJobDeps): Promise<JobOutcome> {
  const entry = deps.resolveChain({
    protocol: job.protocol,
    chainFamily: job.chainFamily,
    chainId: job.chainId,
  });
  if (entry === null) {
    const unknownChainBackoff = nextBackoff({
      attempts: job.attempts,
      schedule: [`${deps.config.UNKNOWN_CHAIN_BACKOFF_MIN}m`],
      firstAttemptAt: job.firstAttemptAt,
      maxAgeDays: deps.config.VERIFY_MAX_AGE_DAYS,
      now: deps.now(),
    });
    if ("delayMs" in unknownChainBackoff) {
      return {
        kind: "reschedule",
        delayMs: unknownChainBackoff.delayMs,
        lastError: "chain_not_in_registry",
      };
    }
    return { kind: "close_unverifiable" };
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
  if (verdict.result === "unverifiable") return { kind: "close_unverifiable" };
  if (verdict.result !== "retry") {
    return { kind: "finalize", verdict, ...observationOf(read, job, verdict) };
  }

  const backoff = nextBackoff({
    attempts: job.attempts,
    schedule: deps.config.VERIFY_BACKOFF_SCHEDULE,
    firstAttemptAt: job.firstAttemptAt,
    maxAgeDays: deps.config.VERIFY_MAX_AGE_DAYS,
    now: deps.now(),
  });
  if ("delayMs" in backoff) {
    return { kind: "reschedule", delayMs: backoff.delayMs, lastError: verdict.error };
  }
  if (read.outcome === "not_found") {
    const corroboration = await corroborateMissing(reader, job.txHash);
    if (corroboration !== "missing") return { kind: "close_unverifiable" };
    return { kind: "finalize", verdict: { result: "strike", reason: "tx_not_found" } };
  }
  return { kind: "close_unverifiable" };
}

const DECLARED_TRANSFER_LOG_LIMIT = 8;

function observationOf(
  read: ReceiptRead,
  job: ClaimedJob,
  verdict: Verdict,
): { observed?: StrikeObservation } {
  if (verdict.result !== "strike") return {};
  if (read.outcome !== "receipt") return {};
  const declaredTokens = [job.tokenInAddress, job.tokenOutAddress]
    .filter((address): address is string => address !== null)
    .map((address) => address.toLowerCase());
  const declaredTokenTransfers = read.receipt.erc20Transfers
    .filter((transfer) => declaredTokens.includes(transfer.token.toLowerCase()))
    .slice(0, DECLARED_TRANSFER_LOG_LIMIT);
  return {
    observed: { transactionValueRaw: read.receipt.transactionValueRaw, declaredTokenTransfers },
  };
}

async function corroborateMissing(reader: ChainReader, txHash: string): Promise<MissingReceiptCorroboration> {
  if (reader.corroborateMissingReceipt === undefined) return "missing";
  try {
    return await reader.corroborateMissingReceipt(txHash);
  } catch {
    return "unknown";
  }
}

export async function readReceipt(reader: ChainReader, txHash: string): Promise<ReceiptRead> {
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
    tier: resolveVerificationTier(job.kind, entry.verificationTier),
    timeToleranceMin: config.VERIFY_TIME_TOLERANCE_MIN,
    amountTolerancePct: config.VERIFY_AMOUNT_TOLERANCE_PCT,
  };
}
