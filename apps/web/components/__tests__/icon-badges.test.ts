import { describe, expect, it } from "vitest";
import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChainBadge } from "../ChainBadge";
import { ProtocolBadge } from "../ProtocolBadge";

function render<Props extends object>(component: FunctionComponent<Props>, props: Props): string {
  return renderToStaticMarkup(createElement(component, props));
}

describe("ProtocolBadge", () => {
  it("renders an icon with the protocol name as alt and title for a known protocol", () => {
    const markup = render(ProtocolBadge, { protocol: "kyberswap" });

    expect(markup).toContain("<img");
    expect(markup).toContain('src="/protocols/kyberswap.svg"');
    expect(markup).toContain('alt="kyberswap"');
    expect(markup).toContain('title="kyberswap"');
  });

  it("renders the uniswap png icon", () => {
    const markup = render(ProtocolBadge, { protocol: "uniswap" });

    expect(markup).toContain('src="/protocols/uniswap.png"');
  });

  it("falls back to the text badge for relay which has no icon", () => {
    const markup = render(ProtocolBadge, { protocol: "relay" });

    expect(markup).not.toContain("<img");
    expect(markup).toContain(">relay<");
  });

  it("falls back to the text badge for an unknown protocol", () => {
    const markup = render(ProtocolBadge, { protocol: "newdex" });

    expect(markup).not.toContain("<img");
    expect(markup).toContain(">newdex<");
  });
});

describe("ChainBadge", () => {
  it("renders the chain icon next to the slug for a known chain", () => {
    const markup = render(ChainBadge, { slug: "base" });

    expect(markup).toContain('src="/chains/base.svg"');
    expect(markup).toContain("base");
  });

  it("renders the arbitrum icon next to the slug", () => {
    const markup = render(ChainBadge, { slug: "arbitrum" });

    expect(markup).toContain('src="/chains/arbitrum.svg"');
  });

  it("renders slug-only for a chain without an icon", () => {
    for (const slug of ["ethereum", "optimism", "polygon", "solana", "robinhood"]) {
      const markup = render(ChainBadge, { slug });

      expect(markup).not.toContain("<img");
      expect(markup).toContain(slug);
    }
  });
});
