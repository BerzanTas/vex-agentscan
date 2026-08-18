import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

  it("renders the uniswap svg icon", () => {
    const markup = render(ProtocolBadge, { protocol: "uniswap" });

    expect(markup).toContain('src="/protocols/uniswap.svg"');
  });

  it("renders the relay jpg icon", () => {
    const markup = render(ProtocolBadge, { protocol: "relay" });

    expect(markup).toContain('src="/protocols/relay.jpg"');
    expect(markup).toContain('title="relay"');
  });

  it("renders the jupiter png icon", () => {
    const markup = render(ProtocolBadge, { protocol: "jupiter" });

    expect(markup).toContain('src="/protocols/jupiter.png"');
    expect(markup).toContain('title="jupiter"');
  });

  it("renders the morpho jpg icon", () => {
    const markup = render(ProtocolBadge, { protocol: "morpho" });

    expect(markup).toContain('src="/protocols/morpho.jpg"');
    expect(markup).toContain('title="morpho"');
  });

  it("renders the pendle jpg icon", () => {
    const markup = render(ProtocolBadge, { protocol: "pendle" });

    expect(markup).toContain('src="/protocols/pendle.jpg"');
    expect(markup).toContain('title="pendle"');
  });

  it("renders the trench jpg icon", () => {
    const markup = render(ProtocolBadge, { protocol: "trench" });

    expect(markup).toContain('src="/protocols/trench.jpg"');
    expect(markup).toContain('title="trench"');
  });

  it("renders the dexscreener jpg icon", () => {
    const markup = render(ProtocolBadge, { protocol: "dexscreener" });

    expect(markup).toContain('src="/protocols/dexscreener.jpg"');
    expect(markup).toContain('title="dexscreener"');
  });

  it("renders the khalani svg icon", () => {
    const markup = render(ProtocolBadge, { protocol: "khalani" });

    expect(markup).toContain('src="/protocols/khalani.svg"');
  });

  it("falls back to the text badge for an unknown protocol", () => {
    const markup = render(ProtocolBadge, { protocol: "newdex" });

    expect(markup).not.toContain("<img");
    expect(markup).toContain(">newdex<");
  });

  it("falls back to the text badge for a protocol emitted by the client without an icon", () => {
    const markup = render(ProtocolBadge, { protocol: "debridge_dln" });

    expect(markup).not.toContain("<img");
    expect(markup).toContain(">debridge_dln<");
  });

  it("falls back to the text badge for a protocol named after an Object prototype member", () => {
    const markup = render(ProtocolBadge, { protocol: "toString" });

    expect(markup).not.toContain("<img");
    expect(markup).toContain(">toString<");
  });
});

describe("the protocol icon registry against the shipped assets", () => {
  const assetDirectory = fileURLToPath(new URL("../../public/protocols", import.meta.url));
  const ICON_EXTENSIONS = [".jpg", ".png", ".svg"];

  function shippedIconFiles(): string[] {
    return readdirSync(assetDirectory)
      .filter((fileName) => ICON_EXTENSIONS.some((extension) => fileName.endsWith(extension)))
      .sort();
  }

  it("renders every icon file present in public/protocols", () => {
    for (const fileName of shippedIconFiles()) {
      const protocol = fileName.slice(0, fileName.lastIndexOf("."));

      const markup = render(ProtocolBadge, { protocol });

      expect(markup).toContain(`src="/protocols/${fileName}"`);
    }
  });

  it("ships the nine protocol icons the registry maps", () => {
    expect(shippedIconFiles()).toEqual([
      "dexscreener.jpg",
      "jupiter.png",
      "khalani.svg",
      "kyberswap.svg",
      "morpho.jpg",
      "pendle.jpg",
      "relay.jpg",
      "trench.jpg",
      "uniswap.svg",
    ]);
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

  it("renders icons for all newly added chains", () => {
    for (const slug of ["ethereum", "optimism", "polygon", "robinhood", "solana"]) {
      const markup = render(ChainBadge, { slug });

      expect(markup).toContain(`src="/chains/${slug}.svg"`);
      expect(markup).toContain(slug);
    }
  });

  it.each([
    "bsc",
    "unichain",
    "monad",
    "avalanche",
    "linea",
    "mantle",
    "berachain",
    "hyperevm",
    "sonic",
    "plasma",
    "ronin",
    "megaeth",
  ])("renders the %s icon beside its slug", (slug) => {
    const markup = render(ChainBadge, { slug });

    expect(markup).toContain(`src="/chains/${slug}.png"`);
    expect(markup).toContain(slug);
  });

  it("renders slug-only for a chain without an icon", () => {
    const markup = render(ChainBadge, { slug: "unlisted" });

    expect(markup).not.toContain("<img");
    expect(markup).toContain("unlisted");
  });
});

describe("ProtocolBadge with the name shown", () => {
  it("renders the icon next to the protocol name for a known protocol", () => {
    const markup = render(ProtocolBadge, { protocol: "kyberswap", withName: true });

    expect(markup).toContain('src="/protocols/kyberswap.svg"');
    expect(markup).toContain('class="protocol-name"');
    expect(markup).toContain(">kyberswap<");
  });

  it("keeps the single text badge for an unknown protocol instead of doubling the name", () => {
    const markup = render(ProtocolBadge, { protocol: "newdex", withName: true });

    expect(markup).not.toContain("protocol-name");
    expect(markup).toContain(">newdex<");
  });
});
