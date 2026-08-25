import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LoadMoreTokens, appendTokensPage } from "../LoadMoreTokens";
import type { TokenStatDto } from "../../lib/api";

const series = [{ bucketStart: 1, volumeUsd: "1", txCount: 1 }];

function tokenWithAddress(address: string): TokenStatDto {
  return {
    chainSlug: "base",
    address,
    symbol: "USDC",
    volumeUsd: "100",
    txCount: 1,
    agentCount: 1,
    protocols: ["kyberswap"],
    lastSeenSeconds: 60,
    series,
  };
}

function markupFor(initialItems: TokenStatDto[], initialCursor: string | null): string {
  return renderToStaticMarkup(
    createElement(LoadMoreTokens, { initialItems, initialCursor, range: "30d" }),
  );
}

describe("appendTokensPage", () => {
  it("keeps the already loaded rows ahead of the fetched page", () => {
    const merged = appendTokensPage(
      { rows: [tokenWithAddress("0xaaa1")], nextCursor: "cursor-1" },
      { items: [tokenWithAddress("0xbbb2")], nextCursor: "cursor-2" },
    );

    expect(merged.rows.map((row) => row.address)).toEqual(["0xaaa1", "0xbbb2"]);
  });

  it("advances the cursor to the one the fetched page carries", () => {
    const merged = appendTokensPage(
      { rows: [tokenWithAddress("0xaaa1")], nextCursor: "cursor-1" },
      { items: [tokenWithAddress("0xbbb2")], nextCursor: "cursor-2" },
    );

    expect(merged.nextCursor).toBe("cursor-2");
  });

  it("ends the listing when the fetched page has no next cursor", () => {
    const merged = appendTokensPage(
      { rows: [tokenWithAddress("0xaaa1")], nextCursor: "cursor-1" },
      { items: [tokenWithAddress("0xbbb2")], nextCursor: null },
    );

    expect(merged.nextCursor).toBeNull();
  });
});

describe("LoadMoreTokens", () => {
  it("offers the load more button while a next cursor exists", () => {
    expect(markupFor([tokenWithAddress("0xaaa1")], "cursor-1")).toContain(">Load more</button>");
  });

  it("omits the load more button at the end of the listing", () => {
    expect(markupFor([tokenWithAddress("0xaaa1")], null)).not.toContain(">Load more</button>");
  });

  it("shows the listing empty state instead of a table when there are no rows", () => {
    const markup = markupFor([], null);

    expect(markup).toContain("No token activity in this window");
    expect(markup).not.toContain("<table");
  });
});
