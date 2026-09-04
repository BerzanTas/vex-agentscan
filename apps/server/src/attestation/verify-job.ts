import {
  ATTESTATION_PROOF_MODES,
  allowlistFor,
  evaluateAttestationVerification,
  nextBackoff,
  type AttestationChainRegistry,
  type AttestationLaunchpad,
  type AttestationMismatchDetail,
  type AttestationReceiptView,
  type ChainEntry,
  type ChainReader,
  type ReceiptView,
  type ResolveChain,
} from "@agentscan/core";
import type { Config } from "../config.js";
import type { ClaimedAttestation } from "../repos/token-attestations-verify-repo.js";
import { readReceipt, type ChainReaderContext } from "../worker/verify-job.js";
import { decodeCreationEvents } from "./creation-events.js";

const WELL_FORMED_TX_HASH = /^0x[0-9a-fA-F]{64}$/;
const ATTEST_CHAIN_FAMILY = "eip155" as const;
const ATTEST_CHAIN_PROTOCOL = "token_attestation";

const EMPTY_CHAIN_READER_CONTEXT: ChainReaderContext = {
  clientConfirmedAt: null,
  executedInRaw: null,
  executedOutRaw: null,
  tokenInAddress: null,
  tokenOutAddress: null,
  executedIn2Raw: null,
  executedOut2Raw: null,
  tokenIn2Address: null,
  tokenOut2Address: null,
};

export type AttestationVerifyDeps = {
  config: Config;
  now: () => Date;
  resolveChain: ResolveChain;
  chainReaderFor: (entry: ChainEntry, context: ChainReaderContext) => ChainReader;
  chainRegistry: AttestationChainRegistry;
};

export type AttestationJobOutcome =
  | { kind: "reschedule"; delayMs: number }
  | { kind: "terminalize_unverifiable" }
  | { kind: "finalize_verified"; derivedTxHash: string }
  | { kind: "finalize_mismatch"; detail: AttestationMismatchDetail };

function isWellFormedTxHash(hint: string | null): hint is string {
  return hint !== null && WELL_FORMED_TX_HASH.test(hint);
}

async function readHeadBlockNumber(reader: ChainReader): Promise<bigint | null> {
  if (reader.getHeadBlockNumber === undefined) return null;
  try {
    return await reader.getHeadBlockNumber();
  } catch {
    return null;
  }
}

function attestationReceiptViewFrom(
  receipt: ReceiptView,
  launchpad: AttestationLaunchpad,
): AttestationReceiptView | null {
  if (receipt.blockNumber === undefined) return null;
  return {
    status: receipt.status,
    blockNumber: receipt.blockNumber,
    creationEvents: decodeCreationEvents(launchpad, receipt.logs ?? []),
    transactionFrom: receipt.transactionFrom,
    transactionTo: receipt.transactionTo,
  };
}

export function scheduleOrGiveUp(job: ClaimedAttestation, deps: AttestationVerifyDeps): AttestationJobOutcome {
  const backoff = nextBackoff({
    attempts: job.attemptCount,
    schedule: deps.config.ATTEST_BACKOFF_SCHEDULE,
    firstAttemptAt: job.firstSeenAt,
    maxAgeDays: deps.config.ATTEST_MAX_AGE_DAYS,
    now: deps.now(),
  });
  if ("delayMs" in backoff) return { kind: "reschedule", delayMs: backoff.delayMs };
  return { kind: "terminalize_unverifiable" };
}

export async function resolveAttestationOutcome(
  job: ClaimedAttestation,
  deps: AttestationVerifyDeps,
): Promise<AttestationJobOutcome> {
  const txHashHint = job.txHashHint;
  if (!isWellFormedTxHash(txHashHint)) return scheduleOrGiveUp(job, deps);

  const entry = deps.resolveChain({
    protocol: ATTEST_CHAIN_PROTOCOL,
    chainFamily: ATTEST_CHAIN_FAMILY,
    chainId: job.chainId,
  });
  if (entry === null) return scheduleOrGiveUp(job, deps);

  const reader = deps.chainReaderFor(entry, EMPTY_CHAIN_READER_CONTEXT);
  const receiptRead = await readReceipt(reader, txHashHint);
  if (receiptRead.outcome === "error") return scheduleOrGiveUp(job, deps);
  if (receiptRead.outcome === "not_found") return scheduleOrGiveUp(job, deps);

  const headBlockNumber = await readHeadBlockNumber(reader);
  if (headBlockNumber === null) return scheduleOrGiveUp(job, deps);

  const allowlistedFactoryAddresses = allowlistFor(deps.chainRegistry, {
    chainId: job.chainId,
    launchpad: job.launchpad,
  });
  const verdict = evaluateAttestationVerification(
    attestationReceiptViewFrom(receiptRead.receipt, job.launchpad),
    {
      tokenAddress: job.tokenAddress,
      recoveredSigner: job.recoveredSigner,
      allowlistedFactoryAddresses,
      proofMode: ATTESTATION_PROOF_MODES[job.launchpad],
      headBlockNumber,
      minConfirmations: deps.config.ATTEST_MIN_CONFIRMATIONS,
    },
  );

  if (verdict.result === "retry") return scheduleOrGiveUp(job, deps);
  if (verdict.result === "mismatch") return { kind: "finalize_mismatch", detail: verdict.detail };
  return { kind: "finalize_verified", derivedTxHash: txHashHint };
}
