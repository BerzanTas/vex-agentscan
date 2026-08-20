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

// Base mainnet, captured 2026-08-17: a Morpho vault supply and the withdrawal
// that closed it, the first lend pair Vex reported.
//   deposit  0x03eaf3f40473c362625c29f05abed8c5621461e3522fd4f73b0239d343333b54
//   withdraw 0x8d872eb3115fd7258b6414a32f1f621b01d1bd17593ec676f028ef36a72a95d2
// Token addresses and raw amounts are the receipt's own; the reporting wallet is
// replaced with a placeholder, since the verifier reads only token and amount and
// this repository does not keep wallet addresses.
const MORPHO_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const MORPHO_VAULT_SHARE = "0xbeef0e0834849acc03f0089f01f4f1eeb06873c9";
const MORPHO_BLUE = "0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb";
const MORPHO_BUNDLER = "0xb98c948cfa24072e58935bc004a8a7b376ae746a";
const MORPHO_ADAPTER = "0xfdd31cdf6712c47a4e67037d9f2e35587f5404c0";
const REPORTER = `0x${"1".repeat(40)}`;
const ZERO_ADDRESS = `0x${"0".repeat(40)}`;

const depositBlockTimestamp = new Date("2026-08-17T13:36:49Z");
const withdrawBlockTimestamp = new Date("2026-08-17T13:40:01Z");

const morphoDepositReceipt: ReceiptView = {
  status: "success",
  blockTimestamp: depositBlockTimestamp,
  transactionValueRaw: "0",
  erc20Transfers: [
    { token: MORPHO_USDC, from: REPORTER, to: MORPHO_BUNDLER, amountRaw: "200000" },
    { token: MORPHO_USDC, from: MORPHO_BUNDLER, to: MORPHO_VAULT_SHARE, amountRaw: "200000" },
    { token: MORPHO_VAULT_SHARE, from: ZERO_ADDRESS, to: REPORTER, amountRaw: "192836490590443813" },
    { token: MORPHO_USDC, from: MORPHO_VAULT_SHARE, to: MORPHO_ADAPTER, amountRaw: "200000" },
    { token: MORPHO_USDC, from: MORPHO_ADAPTER, to: MORPHO_BLUE, amountRaw: "200000" },
  ],
};

const morphoWithdrawReceipt: ReceiptView = {
  status: "success",
  blockTimestamp: withdrawBlockTimestamp,
  transactionValueRaw: "0",
  erc20Transfers: [
    { token: MORPHO_USDC, from: MORPHO_BLUE, to: MORPHO_ADAPTER, amountRaw: "200000" },
    { token: MORPHO_USDC, from: MORPHO_ADAPTER, to: MORPHO_VAULT_SHARE, amountRaw: "200000" },
    { token: MORPHO_VAULT_SHARE, from: REPORTER, to: ZERO_ADDRESS, amountRaw: "192836443169148080" },
    { token: MORPHO_USDC, from: MORPHO_VAULT_SHARE, to: REPORTER, amountRaw: "200000" },
  ],
};

const morphoDepositInput = (overrides: Partial<VerificationInput> = {}): VerificationInput => ({
  txHash: "0x03eaf3f40473c362625c29f05abed8c5621461e3522fd4f73b0239d343333b54",
  clientConfirmedAt: depositBlockTimestamp,
  executedInRaw: "200000",
  executedOutRaw: "192836490590443813",
  tokenInAddress: MORPHO_USDC,
  tokenOutAddress: MORPHO_VAULT_SHARE,
  tier: "full",
  timeToleranceMin: 10,
  amountTolerancePct: 0.5,
  ...overrides,
});

describe("evaluateVerification against real morpho lend receipts on Base", () => {
  it("verifies the supply against the asset spent and the vault shares minted", () => {
    expect(evaluateVerification(morphoDepositReceipt, morphoDepositInput())).toEqual({
      result: "verified_full",
      blockTimestamp: depositBlockTimestamp,
    });
  });

  it("verifies the withdrawal against the shares burned and the asset returned", () => {
    const input = morphoDepositInput({
      txHash: "0x8d872eb3115fd7258b6414a32f1f621b01d1bd17593ec676f028ef36a72a95d2",
      clientConfirmedAt: withdrawBlockTimestamp,
      executedInRaw: "192836443169148080",
      executedOutRaw: "200000",
      tokenInAddress: MORPHO_VAULT_SHARE,
      tokenOutAddress: MORPHO_USDC,
    });

    expect(evaluateVerification(morphoWithdrawReceipt, input)).toEqual({
      result: "verified_full",
      blockTimestamp: withdrawBlockTimestamp,
    });
  });

  it("verifies a supply whose reported confirmation time is absent, as schemaVersion 2 allows", () => {
    expect(evaluateVerification(morphoDepositReceipt, morphoDepositInput({ clientConfirmedAt: null }))).toEqual({
      result: "verified_full",
      blockTimestamp: depositBlockTimestamp,
    });
  });

  it("strikes a supply that overstates the asset it moved into the vault", () => {
    expect(evaluateVerification(morphoDepositReceipt, morphoDepositInput({ executedInRaw: "210000" }))).toEqual({
      result: "strike",
      reason: "amount_mismatch",
    });
  });

  it("strikes a supply that overstates the shares the vault minted", () => {
    const input = morphoDepositInput({ executedOutRaw: "292836490590443813" });

    expect(evaluateVerification(morphoDepositReceipt, input)).toEqual({
      result: "strike",
      reason: "amount_mismatch",
    });
  });
});

describe("a native leg declared with the zero address, as Relay spells it", () => {
  const zeroAddress = `0x${"0".repeat(40)}`;
  const nativeReceipt = receiptFixture({ erc20Transfers: [], transactionValueRaw: "15382649162239" });

  it("verifies a native bridge deposit whose declared amount is the transaction value", () => {
    const input = inputFixture({
      tokenInAddress: zeroAddress,
      executedInRaw: "15382649162239",
      tokenOutAddress: null,
      executedOutRaw: null,
    });

    expect(evaluateVerification(nativeReceipt, input)).toEqual({
      result: "verified_full",
      blockTimestamp,
    });
  });

  it("still strikes a native bridge deposit that overstates what the transaction carried", () => {
    const input = inputFixture({
      tokenInAddress: zeroAddress,
      executedInRaw: "25382649162239",
      tokenOutAddress: null,
      executedOutRaw: null,
    });

    expect(evaluateVerification(nativeReceipt, input)).toEqual({
      result: "strike",
      reason: "amount_mismatch",
    });
  });

  it("verifies a native output leg the receipt cannot carry an erc20 transfer for", () => {
    const input = inputFixture({
      tokenInAddress: null,
      executedInRaw: null,
      tokenOutAddress: zeroAddress,
      executedOutRaw: "15382649162239",
    });

    expect(evaluateVerification(nativeReceipt, input)).toEqual({
      result: "verified_full",
      blockTimestamp,
    });
  });

  it("treats the zero address and the sentinel as the same native token", () => {
    const declared = { executedInRaw: "15382649162239", tokenOutAddress: null, executedOutRaw: null };
    const asZero = evaluateVerification(nativeReceipt, inputFixture({ ...declared, tokenInAddress: zeroAddress }));
    const asSentinel = evaluateVerification(nativeReceipt, inputFixture({ ...declared, tokenInAddress: nativeSentinel }));

    expect(asZero).toEqual(asSentinel);
  });
});
