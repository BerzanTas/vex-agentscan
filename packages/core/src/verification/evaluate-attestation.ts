export type AttestationCreationEvent = {
  emitterAddress: string;
  tokenAddress: string;
  creatorAddress: string;
};

export type AttestationReceiptView = {
  status: "success" | "reverted";
  blockNumber: bigint;
  creationEvents: AttestationCreationEvent[];
};

export type AttestationVerificationInput = {
  tokenAddress: string;
  recoveredSigner: string;
  allowlistedFactoryAddresses: readonly string[];
  headBlockNumber: bigint;
  minConfirmations: number;
};

export type AttestationMismatchDetail = "tx_reverted" | "wrong_token" | "creator_mismatch" | "emitter_not_allowlisted";

export type AttestationVerdict =
  | { result: "verified" }
  | { result: "mismatch"; detail: AttestationMismatchDetail }
  | { result: "retry"; error: "receipt_not_found" | "confirmations_pending" };

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
  if (eventsFromAllowlistedFactory.length === 0) return { result: "mismatch", detail: "emitter_not_allowlisted" };

  const matchesRecoveredSigner = eventsFromAllowlistedFactory.some((event) =>
    sameAddress(event.creatorAddress, input.recoveredSigner),
  );
  if (!matchesRecoveredSigner) return { result: "mismatch", detail: "creator_mismatch" };

  return { result: "verified" };
}

function confirmationsBelowThreshold(blockNumber: bigint, headBlockNumber: bigint, minConfirmations: number): boolean {
  return headBlockNumber - blockNumber < BigInt(minConfirmations);
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
