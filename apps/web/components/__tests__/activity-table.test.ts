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

  it("shows the empty message instead of a table when there are no rows", () => {
    const markup = markupFor([]);

    expect(markup).toContain("Waiting for the first verified activity");
    expect(markup).not.toContain("<table");
  });
});
