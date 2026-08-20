import { isEvmNativeAddress } from "../evm-native-address.js";
import type { Erc20Transfer, ReceiptView } from "./chain-reader.js";

type TransferCounterparty = "from" | "to";

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
  | { result: "unverifiable"; reason: "no_transfers_decoded" }
  | { result: "retry"; error: string };

export function evaluateVerification(receipt: ReceiptView | null, input: VerificationInput): Verdict {
  if (receipt === null) return { result: "retry", error: "receipt_not_found" };
  if (receipt.status === "reverted") return { result: "strike", reason: "tx_reverted" };
  if (blockTimeOutsideTolerance(receipt, input)) return { result: "strike", reason: "time_mismatch" };
  if (input.tier === "basic") return { result: "verified_basic", blockTimestamp: receipt.blockTimestamp };
  const amounts = judgeDeclaredAmounts(receipt, input);
  if (amounts === "mismatch") return { result: "strike", reason: "amount_mismatch" };
  if (amounts === "unprovable") return { result: "unverifiable", reason: "no_transfers_decoded" };
  return { result: "verified_full", blockTimestamp: receipt.blockTimestamp };
}

function blockTimeOutsideTolerance(receipt: ReceiptView, input: VerificationInput): boolean {
  if (input.clientConfirmedAt === null) return false;
  const driftMs = Math.abs(receipt.blockTimestamp.getTime() - input.clientConfirmedAt.getTime());
  return driftMs > input.timeToleranceMin * 60_000;
}

type AmountJudgement = "matches" | "mismatch" | "unprovable";

function judgeDeclaredAmounts(receipt: ReceiptView, input: VerificationInput): AmountJudgement {
  const legs = [declaredInputJudgement(receipt, input), declaredOutputJudgement(receipt, input)];
  if (legs.includes("mismatch")) return "mismatch";
  if (legs.includes("unprovable")) return "unprovable";
  return "matches";
}

function declaredInputJudgement(receipt: ReceiptView, input: VerificationInput): AmountJudgement {
  if (isNativeToken(input.tokenInAddress)) {
    return nativeInputMismatch(receipt, input.executedInRaw, input.amountTolerancePct) ? "mismatch" : "matches";
  }
  return declaredLegJudgement(receipt, input.tokenInAddress, input.executedInRaw, input.amountTolerancePct, "from");
}

function declaredOutputJudgement(receipt: ReceiptView, input: VerificationInput): AmountJudgement {
  if (isNativeToken(input.tokenOutAddress)) return "matches";
  return declaredLegJudgement(receipt, input.tokenOutAddress, input.executedOutRaw, input.amountTolerancePct, "to");
}

function nativeInputMismatch(receipt: ReceiptView, declaredRaw: string | null, tolerancePct: number): boolean {
  if (declaredRaw === null) return false;
  if (receipt.transactionValueRaw === null) return false;
  return !withinTolerance(BigInt(receipt.transactionValueRaw), BigInt(declaredRaw), tolerancePct);
}

function isNativeToken(tokenAddress: string | null): boolean {
  return tokenAddress !== null && isEvmNativeAddress(tokenAddress);
}

function declaredLegJudgement(
  receipt: ReceiptView,
  tokenAddress: string | null,
  declaredRaw: string | null,
  tolerancePct: number,
  counterparty: TransferCounterparty,
): AmountJudgement {
  if (tokenAddress === null || declaredRaw === null) return "matches";
  if (receipt.erc20Transfers.length === 0) return "unprovable";
  const declared = BigInt(declaredRaw);
  const tokenTransfers = receipt.erc20Transfers.filter((transfer) => sameAddress(transfer.token, tokenAddress));
  if (tokenTransfers.some((transfer) => withinTolerance(BigInt(transfer.amountRaw), declared, tolerancePct))) {
    return "matches";
  }
  return someCounterpartyMovedTheDeclaredTotal(tokenTransfers, counterparty, declared, tolerancePct)
    ? "matches"
    : "mismatch";
}

function someCounterpartyMovedTheDeclaredTotal(
  transfers: readonly Erc20Transfer[],
  counterparty: TransferCounterparty,
  declared: bigint,
  tolerancePct: number,
): boolean {
  const totalByCounterparty = new Map<string, bigint>();
  for (const transfer of transfers) {
    const key = transfer[counterparty].toLowerCase();
    totalByCounterparty.set(key, (totalByCounterparty.get(key) ?? 0n) + BigInt(transfer.amountRaw));
  }
  return [...totalByCounterparty.values()].some((total) => withinTolerance(total, declared, tolerancePct));
}

function withinTolerance(actual: bigint, declared: bigint, tolerancePct: number): boolean {
  const toleranceBasisPoints = BigInt(Math.round(tolerancePct * 100));
  const difference = actual > declared ? actual - declared : declared - actual;
  return difference * 10_000n <= declared * toleranceBasisPoints;
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
