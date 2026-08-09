import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TokensTable } from "../TokensTable";
import type { TokenStatDto } from "../../lib/api";

const SEVEN_DAY_SERIES = Array.from({ length: 7 }, (_, index) => ({
  bucketStart: 1_754_438_400 + index * 86_400,
  volumeUsd: index === 6 ? "3312.44" : "0",
  txCount: index === 6 ? 2 : 0,
}));

const usdc: TokenStatDto = {
  chainSlug: "base",
  address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  symbol: "USDC",
  volumeUsd: "5353.31",
  txCount: 12,
  agentCount: 3,
  protocols: ["kyberswap"],
  lastSeenSeconds: 42,
  series: SEVEN_DAY_SERIES,
};

const unnamed: TokenStatDto = {
  chainSlug: "arbitrum",
  address: "0x1234567890abcdef1234567890abcdefabcd",
  symbol: null,
  volumeUsd: "812.00",
  txCount: 2,
  agentCount: 1,
  protocols: ["uniswap"],
  lastSeenSeconds: 3600,
  series: SEVEN_DAY_SERIES,
};

const manyProtocols: TokenStatDto = {
  ...usdc,
  address: "0x4200000000000000000000000000000000000006",
  symbol: "WETH",
  protocols: ["kyberswap", "uniswap", "khalani", "relay"],
};

function markupFor(rows: TokenStatDto[]): string {
  return renderToStaticMarkup(
    createElement(TokensTable, { rows, emptyMessage: "No token activity in this window" }),
  );
}

describe("TokensTable", () => {
  it("names the eight columns in order", () => {
    const headers = [...markupFor([usdc]).matchAll(/<th\s[^>]*>(.*?)<\/th>/g)].map(
      (match) => match[1],
    );

    expect(headers).toEqual([
      "#",
      "Token",
      "Observed volume",
      "Txns",
      "Agents",
      "Protocols",
      "7d",
      "Last seen",
    ]);
  });

  it("shows the symbol of a named token", () => {
    const markup = markupFor([usdc]);

    expect(markup).toContain(">USDC<");
  });

  it("shortens the address of a token without a symbol", () => {
    const markup = markupFor([unnamed]);

    expect(markup).toContain(">0x1234…abcd<");
  });

  it("keeps the full address in the title of a token without a symbol", () => {
    const markup = markupFor([unnamed]);

    expect(markup).toContain('title="0x1234567890abcdef1234567890abcdefabcd"');
  });

  it("shows the observed volume without an estimate badge", () => {
    const markup = markupFor([usdc]);

    expect(markup).toContain("$5.4K");
    expect(markup).not.toContain(">est.<");
  });

  it("keeps the exact volume in the title of the compact one", () => {
    const markup = markupFor([usdc]);

    expect(markup).toContain('title="$5,353.31"');
  });

  it("links the row to the token detail page", () => {
    const markup = markupFor([usdc]);

    expect(markup).toContain('href="/tokens/base/0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"');
  });

  it("stretches the row link over the whole row", () => {
    const markup = markupFor([usdc]);

    expect(markup).toContain('class="feed-row"');
    expect(markup).toContain('class="feed-row-link token-cell"');
  });

  it("shows at most three protocol icons", () => {
    const markup = markupFor([manyProtocols]);

    expect(markup).toContain('src="/protocols/kyberswap.svg"');
    expect(markup).toContain('src="/protocols/uniswap.svg"');
    expect(markup).toContain('src="/protocols/khalani.svg"');
    expect(markup).not.toContain('src="/protocols/relay.jpg"');
  });

  it("counts the protocols it did not show", () => {
    const markup = markupFor([manyProtocols]);

    expect(markup).toContain(">+1<");
  });

  it("shows the age of the newest activity", () => {
    const markup = markupFor([usdc]);

    expect(markup).toContain(">42s<");
  });

  it("shows the empty message instead of a table when there are no tokens", () => {
    const markup = markupFor([]);

    expect(markup).toContain("No token activity in this window");
    expect(markup).not.toContain("<table");
  });

  it("carries no inline style attribute the production CSP would block", () => {
    const markup = markupFor([usdc, unnamed, manyProtocols]);

    expect(markup).not.toContain("style=");
  });
});

describe("TokensTable seven day column", () => {
  it("draws a sparkline from the row series instead of an em dash placeholder", () => {
    const markup = markupFor([usdc]);

    expect(markup).toContain("sparkline-line");
    expect(markup).toContain("Seven day observed volume");
  });
});
