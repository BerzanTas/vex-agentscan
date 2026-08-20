import { isEvmNativeAddress } from "../evm-native-address.js";
import type { ReceiptView } from "./chain-reader.js";

export type VerificationInput = {
  txHash: string;
  clientConfirmedAt: Date | null;
  executedInRaw: string | null;
  executedOutRaw: string | null;
  tokenInAddress: string | null;
  tokenOutAddress: string | null;
  tier: "full" | "basic";
  timeToleranceMin: number;
  amountTolerancePct: number;
};

export type Verdict =
  | { result: "verified_full" | "verified_basic"; blockTimestamp: Date }
  | { result: "strike"; reason: "tx_reverted" | "amount_mismatch" | "time_mismatch" | "tx_not_found" }
  | { result: "retry"; error: string };

export function evaluateVerification(receipt: ReceiptView | null, input: VerificationInput): Verdict {
  if (receipt === null) return { result: "retry", error: "receipt_not_found" };
  if (receipt.status === "reverted") return { result: "strike", reason: "tx_reverted" };
  if (blockTimeOutsideTolerance(receipt, input)) return { result: "strike", reason: "time_mismatch" };
  if (input.tier === "basic") return { result: "verified_basic", blockTimestamp: receipt.blockTimestamp };
  if (declaredAmountsMismatch(receipt, input)) return { result: "strike", reason: "amount_mismatch" };
  return { result: "verified_full", blockTimestamp: receipt.blockTimestamp };
}

function blockTimeOutsideTolerance(receipt: ReceiptView, input: VerificationInput): boolean {
  if (input.clientConfirmedAt === null) return false;
  const driftMs = Math.abs(receipt.blockTimestamp.getTime() - input.clientConfirmedAt.getTime());
  return driftMs > input.timeToleranceMin * 60_000;
}

function declaredAmountsMismatch(receipt: ReceiptView, input: VerificationInput): boolean {
  return declaredInputMismatch(receipt, input) || declaredOutputMismatch(receipt, input);
}

function declaredInputMismatch(receipt: ReceiptView, input: VerificationInput): boolean {
  if (isNativeToken(input.tokenInAddress)) {
    return nativeInputMismatch(receipt, input.executedInRaw, input.amountTolerancePct);
  }
  return declaredLegMismatch(receipt, input.tokenInAddress, input.executedInRaw, input.amountTolerancePct);
}

function declaredOutputMismatch(receipt: ReceiptView, input: VerificationInput): boolean {
  if (isNativeToken(input.tokenOutAddress)) return false;
  return declaredLegMismatch(receipt, input.tokenOutAddress, input.executedOutRaw, input.amountTolerancePct);
}

function nativeInputMismatch(receipt: ReceiptView, declaredRaw: string | null, tolerancePct: number): boolean {
  if (declaredRaw === null) return false;
  if (receipt.transactionValueRaw === null) return false;
  return !withinTolerance(BigInt(receipt.transactionValueRaw), BigInt(declaredRaw), tolerancePct);
}

function isNativeToken(tokenAddress: string | null): boolean {
  return tokenAddress !== null && isEvmNativeAddress(tokenAddress);
}

function declaredLegMismatch(
  receipt: ReceiptView,
  tokenAddress: string | null,
  declaredRaw: string | null,
  tolerancePct: number,
): boolean {
  if (tokenAddress === null || declaredRaw === null) return false;
  const declared = BigInt(declaredRaw);
  const tokenTransfers = receipt.erc20Transfers.filter((transfer) => sameAddress(transfer.token, tokenAddress));
  return !tokenTransfers.some((transfer) => withinTolerance(BigInt(transfer.amountRaw), declared, tolerancePct));
}

function withinTolerance(actual: bigint, declared: bigint, tolerancePct: number): boolean {
  const toleranceBasisPoints = BigInt(Math.round(tolerancePct * 100));
  const difference = actual > declared ? actual - declared : declared - actual;
  return difference * 10_000n <= declared * toleranceBasisPoints;
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
