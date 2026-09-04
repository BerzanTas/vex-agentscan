import type { ChainReader, ReceiptView } from "@agentscan/core";
import type { ChainReaderContext } from "../worker/verify-job.js";

const FAKE_TRANSFER_ADDRESS = "0x0000000000000000000000000000000000000000";

function declaredTransfersFrom(context: ChainReaderContext): ReceiptView["erc20Transfers"] {
  const legs = [
    { token: context.tokenInAddress, amountRaw: context.executedInRaw },
    { token: context.tokenOutAddress, amountRaw: context.executedOutRaw },
    { token: context.tokenIn2Address, amountRaw: context.executedIn2Raw },
    { token: context.tokenOut2Address, amountRaw: context.executedOut2Raw },
  ];
  return legs
    .filter((leg): leg is { token: string; amountRaw: string } => leg.token !== null && leg.amountRaw !== null)
    .map((leg) => ({
      token: leg.token,
      from: FAKE_TRANSFER_ADDRESS,
      to: FAKE_TRANSFER_ADDRESS,
      amountRaw: leg.amountRaw,
    }));
}

export function confirmAllReaderFor(context: ChainReaderContext): ChainReader {
  return {
    getReceipt: () =>
      Promise.resolve({
        status: "success",
        blockTimestamp: context.clientConfirmedAt ?? new Date(),
        erc20Transfers: declaredTransfersFrom(context),
        transactionValueRaw: context.executedInRaw,
      } satisfies ReceiptView),
  };
}
