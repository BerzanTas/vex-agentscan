import { describe, expect, it } from "vitest";
import {
  evaluateAttestationVerification,
  type AttestationCreationEvent,
  type AttestationReceiptView,
  type AttestationVerificationInput,
} from "../verification/evaluate-attestation.js";

const factoryAddress = "0x3857c6c4fe93abb40945dfc8b9d690384cbae014";
const otherAddress = "0x000000000000000000000000000000000000ee";
const claimedToken = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const otherToken = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const recoveredSigner = "0xcccccccccccccccccccccccccccccccccccccc";
const otherSigner = "0xdddddddddddddddddddddddddddddddddddddd";

const creationEvent = (overrides: Partial<AttestationCreationEvent> = {}): AttestationCreationEvent => ({
  emitterAddress: factoryAddress,
  tokenAddress: claimedToken,
  creatorAddress: recoveredSigner,
  ...overrides,
});

const receiptFixture = (overrides: Partial<AttestationReceiptView> = {}): AttestationReceiptView => ({
  status: "success",
  blockNumber: 100n,
  creationEvents: [creationEvent()],
  ...overrides,
});

const inputFixture = (overrides: Partial<AttestationVerificationInput> = {}): AttestationVerificationInput => ({
  tokenAddress: claimedToken,
  recoveredSigner,
  allowlistedFactoryAddresses: [factoryAddress],
  proofMode: "creation_event",
  headBlockNumber: 105n,
  minConfirmations: 5,
  ...overrides,
});

describe("evaluateAttestationVerification", () => {
  it("returns retry receipt_not_found when the receipt is null", () => {
    expect(evaluateAttestationVerification(null, inputFixture())).toEqual({
      result: "retry",
      error: "receipt_not_found",
    });
  });

  it("retries confirmations_pending when depth is below the threshold, never a terminal verdict", () => {
    const receipt = receiptFixture({ blockNumber: 100n });
    const input = inputFixture({ headBlockNumber: 104n, minConfirmations: 5 });

    expect(evaluateAttestationVerification(receipt, input)).toEqual({
      result: "retry",
      error: "confirmations_pending",
    });
  });

  it("verifies at exactly the minimum confirmation depth", () => {
    const receipt = receiptFixture({ blockNumber: 100n });
    const input = inputFixture({ headBlockNumber: 105n, minConfirmations: 5 });

    expect(evaluateAttestationVerification(receipt, input)).toEqual({ result: "verified" });
  });

  it("mismatches tx_reverted when the receipt reverted, even with a well-formed matching event", () => {
    const receipt = receiptFixture({ status: "reverted" });

    expect(evaluateAttestationVerification(receipt, inputFixture())).toEqual({
      result: "mismatch",
      detail: "tx_reverted",
    });
  });

  it("mismatches wrong_token when no creation event names the claimed token", () => {
    const receipt = receiptFixture({ creationEvents: [creationEvent({ tokenAddress: otherToken })] });

    expect(evaluateAttestationVerification(receipt, inputFixture())).toEqual({
      result: "mismatch",
      detail: "wrong_token",
    });
  });

  it("mismatches wrong_token when the receipt has no creation events at all", () => {
    const receipt = receiptFixture({ creationEvents: [] });

    expect(evaluateAttestationVerification(receipt, inputFixture())).toEqual({
      result: "mismatch",
      detail: "wrong_token",
    });
  });

  it("mismatches emitter_not_allowlisted when the matching event was emitted by an untrusted address", () => {
    const receipt = receiptFixture({ creationEvents: [creationEvent({ emitterAddress: otherAddress })] });

    expect(evaluateAttestationVerification(receipt, inputFixture())).toEqual({
      result: "mismatch",
      detail: "emitter_not_allowlisted",
    });
  });

  it("retries allowlist_unconfigured instead of terminalizing when the allowlist is empty", () => {
    const receipt = receiptFixture();
    const input = inputFixture({ allowlistedFactoryAddresses: [] });

    expect(evaluateAttestationVerification(receipt, input)).toEqual({
      result: "retry",
      error: "allowlist_unconfigured",
    });
  });

  it("mismatches creator_mismatch when the allowlisted event's creator differs from the recovered signer", () => {
    const receipt = receiptFixture({ creationEvents: [creationEvent({ creatorAddress: otherSigner })] });

    expect(evaluateAttestationVerification(receipt, inputFixture())).toEqual({
      result: "mismatch",
      detail: "creator_mismatch",
    });
  });

  it("verifies the happy path: allowlisted emitter, exact token, matching creator", () => {
    expect(evaluateAttestationVerification(receiptFixture(), inputFixture())).toEqual({ result: "verified" });
  });

  it("is case-insensitive for factory, token, and creator address comparisons", () => {
    const receipt = receiptFixture({
      creationEvents: [
        creationEvent({
          emitterAddress: factoryAddress.toUpperCase(),
          tokenAddress: claimedToken.toUpperCase(),
          creatorAddress: recoveredSigner.toUpperCase(),
        }),
      ],
    });

    expect(evaluateAttestationVerification(receipt, inputFixture())).toEqual({ result: "verified" });
  });

  it("matches the correct token's event when multiple creations land in one receipt", () => {
    const receipt = receiptFixture({
      creationEvents: [
        creationEvent({ tokenAddress: otherToken, creatorAddress: otherSigner }),
        creationEvent(),
      ],
    });

    expect(evaluateAttestationVerification(receipt, inputFixture())).toEqual({ result: "verified" });
  });
});

/**
 * THE VIRTUALS PROOF. `PreLaunched` carries no creator, so the creation log alone can never say who
 * created the agent; the transaction envelope has to. Every case below is the same receipt with one
 * envelope field moved, because that is exactly the surface an attacker would try.
 */
describe("evaluateAttestationVerification under the creator_transaction proof", () => {
  const bondingV5 = "0xd4ccbfa37e2f35611b3042e4096ad7a3459bd007";
  const creatorlessEvent = creationEvent({ emitterAddress: bondingV5, creatorAddress: null });

  const virtualsReceipt = (overrides: Partial<AttestationReceiptView> = {}): AttestationReceiptView =>
    receiptFixture({
      creationEvents: [creatorlessEvent],
      transactionFrom: recoveredSigner,
      transactionTo: bondingV5,
      ...overrides,
    });

  const virtualsInput = (overrides: Partial<AttestationVerificationInput> = {}): AttestationVerificationInput =>
    inputFixture({
      allowlistedFactoryAddresses: [bondingV5],
      proofMode: "creator_transaction",
      ...overrides,
    });

  it("verifies when the signer sent the creating transaction to an allowlisted launchpad", () => {
    expect(evaluateAttestationVerification(virtualsReceipt(), virtualsInput())).toEqual({
      result: "verified",
    });
  });

  // The keeper case, and the whole reason this mode exists: the keeper's own `launch()` transaction
  // is sent to the same allowlisted contract, so only the sender check separates it from a creation.
  it("mismatches tx_sender_mismatch when someone other than the signer sent the transaction", () => {
    const receipt = virtualsReceipt({ transactionFrom: otherSigner });

    expect(evaluateAttestationVerification(receipt, virtualsInput())).toEqual({
      result: "mismatch",
      detail: "tx_sender_mismatch",
    });
  });

  // A log can be emitted by an allowlisted contract from inside a transaction sent to a wrapper the
  // attacker controls; requiring a direct call is what makes "I created it" mean "I called it".
  it("mismatches tx_target_not_allowlisted when the signer called through some other contract", () => {
    const receipt = virtualsReceipt({ transactionTo: otherAddress });

    expect(evaluateAttestationVerification(receipt, virtualsInput())).toEqual({
      result: "mismatch",
      detail: "tx_target_not_allowlisted",
    });
  });

  it("mismatches tx_target_not_allowlisted for a contract-creation transaction, which has no target", () => {
    const receipt = virtualsReceipt({ transactionTo: null });

    expect(evaluateAttestationVerification(receipt, virtualsInput())).toEqual({
      result: "mismatch",
      detail: "tx_target_not_allowlisted",
    });
  });

  // Missing evidence is not counter-evidence: an RPC that served the receipt but not the
  // transaction must not terminalize an honest attestation.
  it("retries rather than terminalizes when the reader could not read the envelope", () => {
    const receipt = receiptFixture({ creationEvents: [creatorlessEvent] });

    expect(evaluateAttestationVerification(receipt, virtualsInput())).toEqual({
      result: "retry",
      error: "transaction_envelope_unreadable",
    });
  });

  it("still requires the event to name the claimed token and come from the allowlisted contract", () => {
    expect(
      evaluateAttestationVerification(
        virtualsReceipt({ creationEvents: [creationEvent({ tokenAddress: otherToken, creatorAddress: null })] }),
        virtualsInput(),
      ),
    ).toEqual({ result: "mismatch", detail: "wrong_token" });
    expect(
      evaluateAttestationVerification(
        virtualsReceipt({ creationEvents: [creationEvent({ emitterAddress: otherAddress, creatorAddress: null })] }),
        virtualsInput(),
      ),
    ).toEqual({ result: "mismatch", detail: "emitter_not_allowlisted" });
  });
});

// A creation-event proof needs the event to NAME a creator. A decoder that cannot (Virtuals') must
// never satisfy one by accident, whatever the transaction envelope happens to say.
describe("a creation event that names no creator", () => {
  it("cannot satisfy a creation_event proof even when the signer sent the transaction", () => {
    const receipt = receiptFixture({
      creationEvents: [creationEvent({ creatorAddress: null })],
      transactionFrom: recoveredSigner,
      transactionTo: factoryAddress,
    });

    expect(evaluateAttestationVerification(receipt, inputFixture())).toEqual({
      result: "mismatch",
      detail: "creator_mismatch",
    });
  });
});
