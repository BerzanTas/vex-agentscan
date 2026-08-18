import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ActivityTable } from "../ActivityTable";
import type { ActivityRowDto } from "../../lib/api";

const row: ActivityRowDto = {
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
};

function markupFor(rows: ActivityRowDto[]): string {
  return renderToStaticMarkup(
    createElement(ActivityTable, { rows, emptyMessage: "Waiting for the first verified activity" }),
  );
}

describe("ActivityTable", () => {
  it("renders exactly five columns", () => {
    const markup = markupFor([row]);

    expect(markup.match(/<th[\s>]/g)).toHaveLength(5);
  });

  it("names the five columns", () => {
    const markup = markupFor([row]);

    expect(markup).toContain(">Protocol<");
    expect(markup).toContain(">Pair<");
    expect(markup).toContain(">Amount<");
    expect(markup).toContain(">Chain<");
    expect(markup).toContain(">Age<");
  });

  it("drops the status, verification and explorer columns", () => {
    const markup = markupFor([row]);

    expect(markup).not.toContain(">Status<");
    expect(markup).not.toContain(">Verified<");
    expect(markup).not.toContain(">Tx<");
  });

  it("links the whole row to the detail page", () => {
    const markup = markupFor([row]);

    expect(markup).toContain('href="/tx/pub-1"');
  });

  it("marks a swap with the swap glyph", () => {
    const markup = markupFor([row]);

    expect(markup).toContain("⇄");
  });

  it("clips vertical overflow while keeping the wrapper horizontally scrollable", () => {
    const markup = markupFor([row]);

    expect(markup).toContain('class="glass overflow-x-auto overflow-y-clip"');
  });

  it("shows the empty message instead of a table when there are no rows", () => {
    const markup = markupFor([]);

    expect(markup).toContain("Waiting for the first verified activity");
    expect(markup).not.toContain("<table");
  });
});

const bridgeRow: ActivityRowDto = {
  ...row,
  publicId: "pub-2",
  kind: "bridge",
  eventRole: "bridge_send",
  protocol: "relay",
  chainSlug: "arbitrum",
  fromChainSlug: "arbitrum",
  toChainSlug: "base",
};

describe("ActivityTable chain column", () => {
  it("renders both legs of a bridge with an arrow between them", () => {
    const markup = markupFor([bridgeRow]);

    expect(markup).toContain('class="route-arrow"');
    expect(markup).toContain("/chains/arbitrum.svg");
    expect(markup).toContain("/chains/base.svg");
  });

  it("renders the origin chain alone when the destination leg is unresolved", () => {
    const markup = markupFor([{ ...bridgeRow, toChainSlug: null }]);

    expect(markup).not.toContain("route-arrow");
    expect(markup).toContain("/chains/arbitrum.svg");
    expect(markup).not.toContain("/chains/base.svg");
  });

  it("shows a dash rather than putting a lone destination leg in the chain column", () => {
    const markup = markupFor([{ ...bridgeRow, chainSlug: null, fromChainSlug: null }]);

    expect(markup).not.toContain("route-arrow");
    expect(markup).not.toContain("/chains/arbitrum.svg");
    expect(markup).toContain("—");
  });

  it("renders a swap without a route arrow", () => {
    const markup = markupFor([row]);

    expect(markup).not.toContain("route-arrow");
    expect(markup).toContain("/chains/base.svg");
  });

  it("keeps a bridge row at exactly five cells", () => {
    const markup = markupFor([bridgeRow]);

    expect(markup.match(/<td[\s>]/g)).toHaveLength(5);
  });
});

const morphoBorrowRow: ActivityRowDto = {
  ...row,
  publicId: "pub-3",
  kind: "lend",
  eventRole: "lend_borrow_operate",
  protocol: "morpho",
  tokenInSymbol: null,
  tokenOutSymbol: "USDC",
  amountInRaw: null,
  tokenInDecimals: null,
  usdInEst: null,
};

const morphoSupplyRow: ActivityRowDto = {
  ...morphoBorrowRow,
  publicId: "pub-4",
  tokenInSymbol: "cbBTC",
  tokenOutSymbol: null,
  amountInRaw: "234",
  tokenInDecimals: 8,
};

describe("ActivityTable pair column on single-leg rows", () => {
  it("names the token a borrow received rather than repeating the role", () => {
    const markup = markupFor([morphoBorrowRow]);

    expect(markup).toContain("USDC out");
    expect(markup).not.toContain("lend borrow operate");
  });

  it("names the collateral a supply spent", () => {
    const markup = markupFor([morphoSupplyRow]);

    expect(markup).toContain("cbBTC in");
  });

  it("keeps the two operations of the shared role distinguishable", () => {
    const markup = markupFor([morphoBorrowRow, morphoSupplyRow]);

    expect(markup).toContain("USDC out");
    expect(markup).toContain("cbBTC in");
  });

  it("keeps a borrow row at exactly five cells", () => {
    const markup = markupFor([morphoBorrowRow]);

    expect(markup.match(/<td[\s>]/g)).toHaveLength(5);
  });
});

describe("ActivityTable protocol column", () => {
  it("shows the protocol name next to its icon instead of a bare icon", () => {
    const markup = markupFor([row]);

    expect(markup).toContain('class="protocol-name"');
    expect(markup).toContain(">kyberswap<");
  });
});
