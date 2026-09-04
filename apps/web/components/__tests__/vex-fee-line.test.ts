import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ActivityTable } from "../ActivityTable";
import { LegsTable } from "../LegsTable";
import type { ActivityRowDto, TxDetailDto, VexFeeDto } from "../../lib/api";
import { vexFeeAmountLabel } from "../../lib/vex-fee-line";

const baseRow: ActivityRowDto = {
  publicId: "pub-1",
  kind: "swap",
  eventRole: "swap",
  protocol: "kyberswap",
  status: "confirmed",
  verificationState: "verified_full",
  chainSlug: "base",
  fromChainSlug: null,
  toChainSlug: null,
  explorerUrl: "https://basescan.org/tx/0xabc",
  tokenInSymbol: "USDC",
  tokenOutSymbol: "WETH",
  amountInRaw: "5353310000",
  tokenInDecimals: 6,
  usdInEst: "5353.31",
  txHash: "0xabc",
  ageSeconds: 12,
  vexFee: null,
};

const confirmedFee: VexFeeDto = {
  amountRaw: "1200000000000000",
  decimals: 18,
  symbol: "ETH",
  txHash: "0xfee",
  status: "confirmed",
  usdEst: "3.98",
  explorerUrl: "https://basescan.org/tx/0xfee",
};

// What the server sends for an attempt that has not settled: the status and the asset, and no
// money at all, because `read-repo` blanks the amount and the USD estimate for every status but
// `confirmed`.
const unsettledFee = (status: string): VexFeeDto => ({
  amountRaw: null,
  decimals: 18,
  symbol: "ETH",
  txHash: "0xfee",
  status,
  usdEst: null,
  explorerUrl: "https://basescan.org/tx/0xfee",
});

const markupFor = (rows: ActivityRowDto[]) =>
  renderToStaticMarkup(createElement(ActivityTable, { rows, emptyMessage: "nothing yet" }));

describe("vexFeeAmountLabel", () => {
  it("states the amount and the estimate for a confirmed fee", () => {
    expect(vexFeeAmountLabel(confirmedFee)).toContain("ETH");
    expect(vexFeeAmountLabel(confirmedFee)).toContain("$3.98 est.");
  });

  // THE REGRESSION THIS GUARDS. The first version said "charged" whenever the amount was null,
  // which for a pending or reverted fee publishes money Vex never took.
  it("never says a pending or failed fee was charged", () => {
    expect(vexFeeAmountLabel(unsettledFee("pending"))).toBe("pending");
    expect(vexFeeAmountLabel(unsettledFee("definitively_failed"))).toBe("failed");
    expect(vexFeeAmountLabel(unsettledFee("superseded_unproven"))).toBe("inclusion unproven");
  });

  // A confirmed fee whose amount did not survive ingest is a real charge with an unknown size, so
  // "charged" is the honest word for that one case and only that one.
  it("says charged only for a confirmed fee with no amount", () => {
    expect(vexFeeAmountLabel({ ...confirmedFee, amountRaw: null, decimals: null })).toBe("charged");
  });
});

describe("the feed's fee line", () => {
  it("renders the confirmed charge under the amount", () => {
    const markup = markupFor([{ ...baseRow, vexFee: confirmedFee }]);

    expect(markup).toContain("Vex fee");
    expect(markup).toContain("$3.98 est.");
  });

  it("renders a failed fee as failed, with no amount beside it", () => {
    const markup = markupFor([{ ...baseRow, vexFee: unsettledFee("definitively_failed") }]);

    expect(markup).toContain("Vex fee failed");
    expect(markup).not.toContain("Vex fee charged");
  });

  it("renders nothing about a fee when the action paid none", () => {
    expect(markupFor([baseRow])).not.toContain("Vex fee");
  });
});

const baseDetail: TxDetailDto = {
  ...baseRow,
  executedInRaw: "5353310000",
  executedOutRaw: "1500000000000000000",
  tokenOut2Symbol: null,
  tokenOut2Decimals: null,
  amountOut2Raw: null,
  executedOut2Raw: null,
  tokenOutDecimals: 18,
  usdOutEst: "5350.00",
  usdFeeEst: "1.10",
  usdSource: "kyberswap_quote",
  clientCreatedAt: "2026-09-04T10:00:00.000Z",
  clientConfirmedAt: "2026-09-04T10:00:30.000Z",
  failureCode: null,
};

describe("the legs table's second output leg", () => {
  const markupFor = (detail: TxDetailDto) =>
    renderToStaticMarkup(createElement(LegsTable, { detail }));

  it("shows an Out 2 row for a two-asset settlement, with its own symbol and amounts", () => {
    const markup = markupFor({
      ...baseDetail,
      tokenOut2Symbol: "YT-USDC",
      tokenOut2Decimals: 6,
      amountOut2Raw: "3000000",
      executedOut2Raw: "2999000",
    });

    expect(markup).toContain("Out 2");
    expect(markup).toContain("YT-USDC");
  });

  // An ordinary swap must not grow an empty third row: the leg appears only when the ledger holds
  // one.
  it("shows no Out 2 row for a settlement that paid one asset", () => {
    expect(markupFor(baseDetail)).not.toContain("Out 2");
  });
});
