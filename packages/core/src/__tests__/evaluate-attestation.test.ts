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
