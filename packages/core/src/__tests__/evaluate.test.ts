import { describe, expect, it } from "vitest";
import type { ReceiptView } from "../verification/chain-reader.js";
import { evaluateVerification, type VerificationInput } from "../verification/evaluate.js";

const confirmedAt = new Date("2026-07-30T12:00:00Z");
const blockTimestamp = new Date("2026-07-30T12:02:00Z");

const nativeSentinel = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

const receiptFixture = (overrides: Partial<ReceiptView> = {}): ReceiptView => ({
  status: "success",
  blockTimestamp,
  erc20Transfers: [
    { token: "0xaa11", from: "0x1111", to: "0x2222", amountRaw: "1000000" },
    { token: "0xbb22", from: "0x2222", to: "0x1111", amountRaw: "2000000" },
  ],
  transactionValueRaw: null,
  ...overrides,
});

const inputFixture = (overrides: Partial<VerificationInput> = {}): VerificationInput => ({
  txHash: `0x${"1".repeat(64)}`,
  clientConfirmedAt: confirmedAt,
  executedInRaw: "1000000",
  executedOutRaw: "2000000",
  tokenInAddress: "0xaa11",
  tokenOutAddress: "0xbb22",
  tier: "full",
  timeToleranceMin: 10,
  amountTolerancePct: 0.5,
  ...overrides,
});

describe("evaluateVerification", () => {
  it("returns retry receipt_not_found when the receipt is null", () => {
    expect(evaluateVerification(null, inputFixture())).toEqual({ result: "retry", error: "receipt_not_found" });
  });

  it("strikes tx_reverted when the receipt is reverted", () => {
    expect(evaluateVerification(receiptFixture({ status: "reverted" }), inputFixture())).toEqual({
      result: "strike",
      reason: "tx_reverted",
    });
  });

  it("strikes amount_mismatch when a transfer is off by more than the tolerance", () => {
    const receipt = receiptFixture({
      erc20Transfers: [
        { token: "0xaa11", from: "0x1111", to: "0x2222", amountRaw: "1006000" },
        { token: "0xbb22", from: "0x2222", to: "0x1111", amountRaw: "2000000" },
      ],
    });
    expect(evaluateVerification(receipt, inputFixture())).toEqual({ result: "strike", reason: "amount_mismatch" });
  });

  it("strikes amount_mismatch when a declared token has no transfer in the receipt", () => {
    const receipt = receiptFixture({
      erc20Transfers: [{ token: "0xbb22", from: "0x2222", to: "0x1111", amountRaw: "2000000" }],
    });
    expect(evaluateVerification(receipt, inputFixture())).toEqual({ result: "strike", reason: "amount_mismatch" });
  });

  it("verifies when a transfer is within the amount tolerance", () => {
    const receipt = receiptFixture({
      erc20Transfers: [
        { token: "0xaa11", from: "0x1111", to: "0x2222", amountRaw: "1005000" },
        { token: "0xbb22", from: "0x2222", to: "0x1111", amountRaw: "2000000" },
      ],
    });
    expect(evaluateVerification(receipt, inputFixture())).toEqual({ result: "verified_full", blockTimestamp });
  });

  it("strikes time_mismatch when the block timestamp is outside the tolerance window", () => {
    const receipt = receiptFixture({ blockTimestamp: new Date("2026-07-30T12:11:00Z") });
    expect(evaluateVerification(receipt, inputFixture())).toEqual({ result: "strike", reason: "time_mismatch" });
  });

  it("skips the time check when clientConfirmedAt is null", () => {
    const farBlockTimestamp = new Date("2026-06-01T00:00:00Z");
    const receipt = receiptFixture({ blockTimestamp: farBlockTimestamp });
    expect(evaluateVerification(receipt, inputFixture({ clientConfirmedAt: null }))).toEqual({
      result: "verified_full",
      blockTimestamp: farBlockTimestamp,
    });
  });

  it("returns verified_basic without amount checks for tier basic", () => {
    const receipt = receiptFixture({ erc20Transfers: [] });
    expect(evaluateVerification(receipt, inputFixture({ tier: "basic" }))).toEqual({
      result: "verified_basic",
      blockTimestamp,
    });
  });

  it("returns verified_full when everything matches", () => {
    expect(evaluateVerification(receiptFixture(), inputFixture())).toEqual({ result: "verified_full", blockTimestamp });
  });

  it("verifies a native input leg when the transaction value is within the tolerance", () => {
    const receipt = receiptFixture({
      erc20Transfers: [{ token: "0xbb22", from: "0x2222", to: "0x1111", amountRaw: "2000000" }],
      transactionValueRaw: "1004000000000000000",
    });
    const input = inputFixture({ tokenInAddress: nativeSentinel, executedInRaw: "1000000000000000000" });
    expect(evaluateVerification(receipt, input)).toEqual({ result: "verified_full", blockTimestamp });
  });

  it("strikes amount_mismatch when the transaction value is outside the tolerance for a native input leg", () => {
    const receipt = receiptFixture({
      erc20Transfers: [{ token: "0xbb22", from: "0x2222", to: "0x1111", amountRaw: "2000000" }],
      transactionValueRaw: "1006000000000000000",
    });
    const input = inputFixture({ tokenInAddress: nativeSentinel, executedInRaw: "1000000000000000000" });
    expect(evaluateVerification(receipt, input)).toEqual({ result: "strike", reason: "amount_mismatch" });
  });

  it("skips the native input check when the transaction value is unavailable", () => {
    const receipt = receiptFixture({
      erc20Transfers: [{ token: "0xbb22", from: "0x2222", to: "0x1111", amountRaw: "2000000" }],
      transactionValueRaw: null,
    });
    const input = inputFixture({ tokenInAddress: nativeSentinel, executedInRaw: "1000000000000000000" });
    expect(evaluateVerification(receipt, input)).toEqual({ result: "verified_full", blockTimestamp });
  });

  it("skips the cross-check for a native output leg with no matching transfer logs", () => {
    const receipt = receiptFixture({
      erc20Transfers: [{ token: "0xaa11", from: "0x1111", to: "0x2222", amountRaw: "1000000" }],
    });
    const input = inputFixture({ tokenOutAddress: nativeSentinel, executedOutRaw: "3000000000000000000" });
    expect(evaluateVerification(receipt, input)).toEqual({ result: "verified_full", blockTimestamp });
  });

  it("still strikes a mismatching erc20 output leg alongside a matching native input leg", () => {
    const receipt = receiptFixture({
      erc20Transfers: [],
      transactionValueRaw: "1000000000000000000",
    });
    const input = inputFixture({ tokenInAddress: nativeSentinel, executedInRaw: "1000000000000000000" });
    expect(evaluateVerification(receipt, input)).toEqual({ result: "strike", reason: "amount_mismatch" });
  });
});
