import type { AttestationProofMode } from "../chain-registry/attestation-chain-registry.js";

export type AttestationCreationEvent = {
  emitterAddress: string;
  tokenAddress: string;
  /**
   * The creator the event itself names, or null when the launchpad's creation event carries no
   * creator field. Virtuals' `PreLaunched` is the null case, and it is why the proof mode exists:
   * a null here can never satisfy a `creation_event` proof, so a decoder that cannot name the
   * creator cannot accidentally prove one.
   */
  creatorAddress: string | null;
};

export type AttestationReceiptView = {
  status: "success" | "reverted";
  blockNumber: bigint;
  creationEvents: AttestationCreationEvent[];
  /**
   * The transaction envelope, for the `creator_transaction` proof. `undefined` means the reader
   * could not read it (an RPC that served the receipt but not the transaction), which is a RETRY
   * and never a verdict: an unreadable envelope is missing evidence, not counter-evidence.
   */
  transactionFrom?: string | null;
  transactionTo?: string | null;
};

export type AttestationVerificationInput = {
  tokenAddress: string;
  recoveredSigner: string;
  allowlistedFactoryAddresses: readonly string[];
  proofMode: AttestationProofMode;
  headBlockNumber: bigint;
  minConfirmations: number;
};

export type AttestationMismatchDetail =
  | "tx_reverted"
  | "wrong_token"
  | "creator_mismatch"
  | "emitter_not_allowlisted"
  | "tx_sender_mismatch"
  | "tx_target_not_allowlisted";

export type AttestationVerdict =
  | { result: "verified" }
  | { result: "mismatch"; detail: AttestationMismatchDetail }
  | {
      result: "retry";
      error: "receipt_not_found" | "confirmations_pending" | "allowlist_unconfigured" | "transaction_envelope_unreadable";
    };

export function evaluateAttestationVerification(
  receipt: AttestationReceiptView | null,
  input: AttestationVerificationInput,
): AttestationVerdict {
  if (receipt === null) return { result: "retry", error: "receipt_not_found" };
  if (confirmationsBelowThreshold(receipt.blockNumber, input.headBlockNumber, input.minConfirmations)) {
    return { result: "retry", error: "confirmations_pending" };
  }
  if (receipt.status === "reverted") return { result: "mismatch", detail: "tx_reverted" };

  const eventsNamingClaimedToken = receipt.creationEvents.filter((event) =>
    sameAddress(event.tokenAddress, input.tokenAddress),
  );
  if (eventsNamingClaimedToken.length === 0) return { result: "mismatch", detail: "wrong_token" };

  const eventsFromAllowlistedFactory = eventsNamingClaimedToken.filter((event) =>
    input.allowlistedFactoryAddresses.some((factoryAddress) => sameAddress(factoryAddress, event.emitterAddress)),
  );
  if (eventsFromAllowlistedFactory.length === 0) {
    if (input.allowlistedFactoryAddresses.length === 0) return { result: "retry", error: "allowlist_unconfigured" };
    return { result: "mismatch", detail: "emitter_not_allowlisted" };
  }

  return input.proofMode === "creation_event"
    ? creationEventVerdict(eventsFromAllowlistedFactory, input)
    : creatorTransactionVerdict(receipt, input);
}

/** The creation log names the creator, so the log alone decides. */
function creationEventVerdict(
  events: readonly AttestationCreationEvent[],
  input: AttestationVerificationInput,
): AttestationVerdict {
  const matchesRecoveredSigner = events.some(
    (event) => event.creatorAddress !== null && sameAddress(event.creatorAddress, input.recoveredSigner),
  );
  return matchesRecoveredSigner ? { result: "verified" } : { result: "mismatch", detail: "creator_mismatch" };
}

/**
 * The creation log names no creator, so the transaction that produced it is the proof: the signer
 * must BE the sender, and the transaction must have been sent to an allowlisted launchpad contract.
 *
 * The `to` check is not redundant with the emitter allowlist above. A log can be emitted by an
 * allowlisted contract from inside a transaction sent to an arbitrary wrapper the attacker
 * controls; requiring the sender to have called the launchpad directly is what makes
 * "I am the creator" mean the same thing as "I sent the creating call".
 */
function creatorTransactionVerdict(
  receipt: AttestationReceiptView,
  input: AttestationVerificationInput,
): AttestationVerdict {
  const { transactionFrom, transactionTo } = receipt;
  if (transactionFrom === undefined || transactionTo === undefined) {
    return { result: "retry", error: "transaction_envelope_unreadable" };
  }
  if (transactionTo === null || !input.allowlistedFactoryAddresses.some((address) => sameAddress(address, transactionTo))) {
    return { result: "mismatch", detail: "tx_target_not_allowlisted" };
  }
  if (transactionFrom === null || !sameAddress(transactionFrom, input.recoveredSigner)) {
    return { result: "mismatch", detail: "tx_sender_mismatch" };
  }
  return { result: "verified" };
}

function confirmationsBelowThreshold(blockNumber: bigint, headBlockNumber: bigint, minConfirmations: number): boolean {
  return headBlockNumber - blockNumber < BigInt(minConfirmations);
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
