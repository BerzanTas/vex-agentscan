import { describe, expect, it } from "vitest";
import type { ReceiptView } from "../verification/chain-reader.js";
import { evaluateVerification, type VerificationInput } from "../verification/evaluate.js";

// Base mainnet, captured 2026-08-17: the four Morpho Blue market operations Vex ran end to end on
// the cbBTC/USDC market 0x9103c3b4...191836, and the reward-claim shape a Merkl claim settles as.
//
// Every amount, token address and block time below is the receipt's own, read back from
// eth_getTransactionReceipt. The reporting wallet is replaced with a placeholder, following the
// vault-lend fixtures: the verifier reads only token and amount, and this repository keeps no
// wallet addresses.
//
// The shape under test is the SINGLE-LEG row. A Blue market operation moves one token in one
// direction, so exactly one of tokenIn/tokenOut is populated and the other is null, in both
// directions:
//   supply_collateral   asset in    0xa553a22e...3bb5cf   234 raw cbBTC (8dp) spent
//   borrow              asset out   0x39347cee...2c44c5   50000 raw USDC (6dp) received
//   repay               asset in    0x6c617cec...2b0759   50001 raw USDC (6dp) spent
//   withdraw_collateral asset out   0xa5abefbe...d2d8fb   234 raw cbBTC (8dp) received
//
// declaredLegMismatch returns false for a null token, so the empty side must not silently pass the
// populated one: each case below also asserts the populated side is still cross-checked.
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const CBBTC = "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf";
const MORPHO_BLUE = "0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb";
const GENERAL_ADAPTER = "0xb98c948cfa24072e58935bc004a8a7b376ae746a";
const REPORTER = `0x${"1".repeat(40)}`;

const SUPPLY_COLLATERAL_RAW = "234";
const BORROW_RAW = "50000";
const REPAY_RAW = "50001";
const WITHDRAW_COLLATERAL_RAW = "234";

const supplyCollateralAt = new Date("2026-08-17T17:18:17Z");
const borrowAt = new Date("2026-08-17T17:19:27Z");
const repayAt = new Date("2026-08-17T17:20:29Z");
const withdrawCollateralAt = new Date("2026-08-17T17:21:13Z");

// The supply is bundled: the wallet pays GeneralAdapter1, which forwards to Morpho Blue. Both hops
// carry the same raw amount, so the cross-check has two candidate transfers and needs neither hop
// named.
const supplyCollateralReceipt: ReceiptView = {
  status: "success",
  blockTimestamp: supplyCollateralAt,
  transactionValueRaw: "0",
  erc20Transfers: [
    { token: CBBTC, from: REPORTER, to: GENERAL_ADAPTER, amountRaw: SUPPLY_COLLATERAL_RAW },
    { token: CBBTC, from: GENERAL_ADAPTER, to: MORPHO_BLUE, amountRaw: SUPPLY_COLLATERAL_RAW },
  ],
};

// A borrow is a direct Blue call with no approval leg at all: one transfer, protocol to wallet.
const borrowReceipt: ReceiptView = {
  status: "success",
  blockTimestamp: borrowAt,
  transactionValueRaw: "0",
  erc20Transfers: [{ token: USDC, from: MORPHO_BLUE, to: REPORTER, amountRaw: BORROW_RAW }],
};

const repayReceipt: ReceiptView = {
  status: "success",
  blockTimestamp: repayAt,
  transactionValueRaw: "0",
  erc20Transfers: [
    { token: USDC, from: REPORTER, to: GENERAL_ADAPTER, amountRaw: REPAY_RAW },
    { token: USDC, from: GENERAL_ADAPTER, to: MORPHO_BLUE, amountRaw: REPAY_RAW },
  ],
};

const withdrawCollateralReceipt: ReceiptView = {
  status: "success",
  blockTimestamp: withdrawCollateralAt,
  transactionValueRaw: "0",
  erc20Transfers: [
    { token: CBBTC, from: MORPHO_BLUE, to: REPORTER, amountRaw: WITHDRAW_COLLATERAL_RAW },
  ],
};

function marketInput(overrides: Partial<VerificationInput>): VerificationInput {
  return {
    txHash: "0x00",
    clientConfirmedAt: null,
    executedInRaw: null,
    executedOutRaw: null,
    tokenInAddress: null,
    tokenOutAddress: null,
    executedIn2Raw: null,
    executedOut2Raw: null,
    tokenIn2Address: null,
    tokenOut2Address: null,
    tier: "full",
    timeToleranceMin: 10,
    amountTolerancePct: 0.5,
    ...overrides,
  };
}

const supplyCollateralInput = (overrides: Partial<VerificationInput> = {}): VerificationInput =>
  marketInput({
    txHash: "0xa553a22efef678e6184f2122fec24dacc1b7b274da4486715349f736ec3bb5cf",
    clientConfirmedAt: supplyCollateralAt,
    executedInRaw: SUPPLY_COLLATERAL_RAW,
    tokenInAddress: CBBTC,
    ...overrides,
  });

const borrowInput = (overrides: Partial<VerificationInput> = {}): VerificationInput =>
  marketInput({
    txHash: "0x39347cee648bc4e34566dd1cce056d50961e873f5a88332bc1d7b1d5402c44c5",
    clientConfirmedAt: borrowAt,
    executedOutRaw: BORROW_RAW,
    tokenOutAddress: USDC,
    ...overrides,
  });

const repayInput = (overrides: Partial<VerificationInput> = {}): VerificationInput =>
  marketInput({
    txHash: "0x6c617cec175462166980ef6a8873f0c4448fbdd4c32c2c6a205a25ec0d2b0759",
    clientConfirmedAt: repayAt,
    executedInRaw: REPAY_RAW,
    tokenInAddress: USDC,
    ...overrides,
  });

const withdrawCollateralInput = (overrides: Partial<VerificationInput> = {}): VerificationInput =>
  marketInput({
    txHash: "0xa5abefbea03821db26886dbd13becf4c9dc613afd703fd7f0053eb1815d2d8fb",
    clientConfirmedAt: withdrawCollateralAt,
    executedOutRaw: WITHDRAW_COLLATERAL_RAW,
    tokenOutAddress: CBBTC,
    ...overrides,
  });

describe("evaluateVerification against the real Morpho Blue market receipts on Base", () => {
  it("verifies a collateral supply against the collateral that left the wallet", () => {
    expect(evaluateVerification(supplyCollateralReceipt, supplyCollateralInput())).toEqual({
      result: "verified_full",
      blockTimestamp: supplyCollateralAt,
    });
  });

  it("verifies a borrow against the loan asset that reached the wallet", () => {
    expect(evaluateVerification(borrowReceipt, borrowInput())).toEqual({
      result: "verified_full",
      blockTimestamp: borrowAt,
    });
  });

  it("verifies a repayment against the loan asset that left the wallet", () => {
    expect(evaluateVerification(repayReceipt, repayInput())).toEqual({
      result: "verified_full",
      blockTimestamp: repayAt,
    });
  });

  it("verifies a collateral withdrawal against the collateral that reached the wallet", () => {
    expect(evaluateVerification(withdrawCollateralReceipt, withdrawCollateralInput())).toEqual({
      result: "verified_full",
      blockTimestamp: withdrawCollateralAt,
    });
  });
});

describe("the populated leg of a single-leg market row is still cross-checked", () => {
  it("strikes a collateral supply that overstates the collateral it moved", () => {
    expect(
      evaluateVerification(supplyCollateralReceipt, supplyCollateralInput({ executedInRaw: "300" })),
    ).toEqual({ result: "strike", reason: "amount_mismatch" });
  });

  it("strikes a borrow that overstates the debt it drew", () => {
    expect(evaluateVerification(borrowReceipt, borrowInput({ executedOutRaw: "80000" }))).toEqual({
      result: "strike",
      reason: "amount_mismatch",
    });
  });

  it("strikes a repayment that overstates the debt it retired", () => {
    expect(evaluateVerification(repayReceipt, repayInput({ executedInRaw: "70000" }))).toEqual({
      result: "strike",
      reason: "amount_mismatch",
    });
  });

  it("strikes a collateral withdrawal that overstates the collateral it took back", () => {
    expect(
      evaluateVerification(
        withdrawCollateralReceipt,
        withdrawCollateralInput({ executedOutRaw: "500" }),
      ),
    ).toEqual({ result: "strike", reason: "amount_mismatch" });
  });

  // The two tokens of a market carry different decimals, and 234 raw cbBTC is not 234 raw USDC.
  // Naming the wrong token must not verify against the right number.
  it("strikes a borrow that names the collateral token instead of the loan token", () => {
    expect(evaluateVerification(borrowReceipt, borrowInput({ tokenOutAddress: CBBTC }))).toEqual({
      result: "strike",
      reason: "amount_mismatch",
    });
  });
});

// Merkl pays rewards in whatever tokens the campaigns ran in, so ONE claim transaction can credit
// several tokens at once. The contract records it the way a pendle.claim is recorded: kind yield,
// role yield_claim, no input leg, and a single anchored token credit as the leg. The other credits
// stay in the client's own intent params, which the ingest contract does not carry.
//
// NOT captured from a Vex receipt: Vex's rewards tool is read-only today and the reporting wallet
// has no claimable Merkl rewards, so no Vex claim transaction exists to capture. The token
// identities are the real Base ones (MORPHO 18dp 0xbaa5..0842, USDC 6dp) and the shape is the
// distributor's own: one Transfer per reward token, distributor to claimant, in one transaction.
const MERKL_DISTRIBUTOR = "0x3ef3d8ba38ebe18db133cec108f4d14ce00dd9ae";
const MORPHO_TOKEN = "0xbaa5cc21fd487b8fcc2f632f3f4e8d37262a0842";
const CLAIMED_MORPHO_RAW = "4182300000000000000";
const CLAIMED_USDC_RAW = "1370411";

const claimAt = new Date("2026-08-17T17:30:05Z");

const merklClaimReceipt: ReceiptView = {
  status: "success",
  blockTimestamp: claimAt,
  transactionValueRaw: "0",
  erc20Transfers: [
    { token: MORPHO_TOKEN, from: MERKL_DISTRIBUTOR, to: REPORTER, amountRaw: CLAIMED_MORPHO_RAW },
    { token: USDC, from: MERKL_DISTRIBUTOR, to: REPORTER, amountRaw: CLAIMED_USDC_RAW },
  ],
};

const claimInput = (overrides: Partial<VerificationInput> = {}): VerificationInput =>
  marketInput({
    txHash: "0x0000000000000000000000000000000000000000000000000000000000000c1a",
    clientConfirmedAt: claimAt,
    executedOutRaw: CLAIMED_MORPHO_RAW,
    tokenOutAddress: MORPHO_TOKEN,
    ...overrides,
  });

describe("evaluateVerification against a multi-token reward claim", () => {
  it("verifies the anchored credit without needing the other tokens declared", () => {
    expect(evaluateVerification(merklClaimReceipt, claimInput())).toEqual({
      result: "verified_full",
      blockTimestamp: claimAt,
    });
  });

  it("verifies just as well when the anchor is the other claimed token", () => {
    const anchoredOnUsdc = claimInput({ executedOutRaw: CLAIMED_USDC_RAW, tokenOutAddress: USDC });

    expect(evaluateVerification(merklClaimReceipt, anchoredOnUsdc)).toEqual({
      result: "verified_full",
      blockTimestamp: claimAt,
    });
  });

  // The amounts of two reward tokens are unrelated, so the anchor must match its OWN token's
  // transfer and not merely appear somewhere in the receipt.
  it("strikes an anchor that claims one token's amount against the other token", () => {
    const crossed = claimInput({ executedOutRaw: CLAIMED_USDC_RAW, tokenOutAddress: MORPHO_TOKEN });

    expect(evaluateVerification(merklClaimReceipt, crossed)).toEqual({
      result: "strike",
      reason: "amount_mismatch",
    });
  });

  it("strikes a claim that overstates the anchored credit", () => {
    expect(evaluateVerification(merklClaimReceipt, claimInput({ executedOutRaw: "9182300000000000000" }))).toEqual({
      result: "strike",
      reason: "amount_mismatch",
    });
  });
});
