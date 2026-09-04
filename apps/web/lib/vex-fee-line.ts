import type { VexFeeDto } from "./api";
import { formatRawAmountDisplay, formatUsdAmount } from "./format";

/**
 * What the Vex fee reads as, in one place, because the feed and the transaction page must not
 * disagree about whether money changed hands.
 *
 * The status decides first. `amountRaw` is null for every status but `confirmed` (the server blanks
 * the money fields there), so a pending or failed attempt can only ever say what happened to it -
 * "pending", "failed" - and never a number. Saying "charged" for a fee that reverted would publish
 * money Vex never took, which is the exact failure this split exists to prevent.
 */
export function vexFeeAmountLabel(fee: VexFeeDto): string {
  if (fee.status !== "confirmed") return statusWord(fee.status);
  if (fee.amountRaw === null || fee.decimals === null) return "charged";
  const symbol = fee.symbol === null ? "" : ` ${fee.symbol}`;
  const usd = fee.usdEst === null ? "" : ` · $${formatUsdAmount(fee.usdEst)} est.`;
  return `${formatRawAmountDisplay(fee.amountRaw, fee.decimals)}${symbol}${usd}`;
}

function statusWord(status: string): string {
  if (status === "definitively_failed") return "failed";
  if (status === "superseded_unproven") return "inclusion unproven";
  return status.replace(/_/g, " ");
}
