import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LoadMoreActivity, appendActivityPage } from "../LoadMoreActivity";
import type { ActivityRowDto } from "../../lib/api";

function rowWithId(publicId: string): ActivityRowDto {
  return {
    publicId,
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
}

function markupFor(initialItems: ActivityRowDto[], initialCursor: string | null): string {
  return renderToStaticMarkup(createElement(LoadMoreActivity, { initialItems, initialCursor }));
}

describe("appendActivityPage", () => {
  it("keeps the already loaded rows ahead of the fetched page", () => {
    const merged = appendActivityPage(
      { rows: [rowWithId("pub-1")], nextCursor: "cursor-1" },
      { items: [rowWithId("pub-2")], nextCursor: "cursor-2" },
    );

    expect(merged.rows.map((row) => row.publicId)).toEqual(["pub-1", "pub-2"]);
  });

  it("advances the cursor to the one the fetched page carries", () => {
    const merged = appendActivityPage(
      { rows: [rowWithId("pub-1")], nextCursor: "cursor-1" },
      { items: [rowWithId("pub-2")], nextCursor: "cursor-2" },
    );

    expect(merged.nextCursor).toBe("cursor-2");
  });

  it("ends the feed when the fetched page has no next cursor", () => {
    const merged = appendActivityPage(
      { rows: [rowWithId("pub-1")], nextCursor: "cursor-1" },
      { items: [rowWithId("pub-2")], nextCursor: null },
    );

    expect(merged.nextCursor).toBeNull();
  });
});

describe("LoadMoreActivity", () => {
  it("offers the load more button while a next cursor exists", () => {
    const markup = markupFor([rowWithId("pub-1")], "cursor-1");

    expect(markup).toContain(">Load more</button>");
  });

  it("omits the load more button at the end of the feed", () => {
    const markup = markupFor([rowWithId("pub-1")], null);

    expect(markup).not.toContain("<button");
  });

  it("shows the feed empty state instead of a table when there are no rows", () => {
    const markup = markupFor([], null);

    expect(markup).toContain("Waiting for the first verified activity");
    expect(markup).not.toContain("<table");
  });
});
