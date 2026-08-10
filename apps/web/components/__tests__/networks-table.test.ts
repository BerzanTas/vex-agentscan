import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NetworksTable } from "../NetworksTable";
import {
  bodyCellsHiddenBelowMd,
  headersHiddenBelowMd,
  headersShownBelowMd,
} from "./table-column-visibility";
import type { NetworkStatDto } from "../../lib/api";

const activeNetwork: NetworkStatDto = {
  chainSlug: "base",
  displayName: "Base",
  verificationTier: "full",
  volumeUsd: "5353.31",
  txCount: 1284,
  bridgeInCount: 12,
  bridgeOutCount: 7,
  lastSeenSeconds: 42,
};

const idleRegistryNetwork: NetworkStatDto = {
  chainSlug: "robinhood",
  displayName: "Robinhood Chain",
  verificationTier: "basic",
  volumeUsd: "0",
  txCount: 0,
  bridgeInCount: 0,
  bridgeOutCount: 0,
  lastSeenSeconds: null,
};

function markupFor(networks: NetworkStatDto[]): string {
  return renderToStaticMarkup(createElement(NetworksTable, { networks }));
}

function headersOf(markup: string): string[] {
  return [...markup.matchAll(/<th\s[^>]*>([^<]*)</g)].map((match) => match[1] ?? "");
}

describe("NetworksTable", () => {
  it("names the six columns in order", () => {
    const markup = markupFor([activeNetwork]);

    expect(headersOf(markup)).toEqual([
      "Network",
      "Verification",
      "Observed volume",
      "Txns",
      "Bridge in / out",
      "Last seen",
    ]);
  });

  it("links the whole row to the network detail page", () => {
    const markup = markupFor([activeNetwork]);

    expect(markup).toContain('href="/networks/base"');
    expect(markup).toContain('class="feed-row-link"');
  });

  it("marks a full verification tier with the full tier badge", () => {
    const markup = markupFor([activeNetwork]);

    expect(markup).toContain('class="tier-badge tier-badge-full"');
    expect(markup).toContain(">full<");
  });

  it("marks a basic verification tier with the basic tier badge", () => {
    const markup = markupFor([idleRegistryNetwork]);

    expect(markup).toContain('class="tier-badge tier-badge-basic"');
    expect(markup).toContain(">basic<");
  });

  it("keeps a registry network with no activity on the list, showing zeros", () => {
    const markup = markupFor([activeNetwork, idleRegistryNetwork]);

    expect(markup).toContain("Robinhood Chain");
    expect(markup).toContain('href="/networks/robinhood"');
    expect(markup).toContain("$0.00");
    expect(markup).toContain(">0<");
    expect(markup).toContain("0 / 0");
  });

  it("shows a dash instead of an age when a network was never seen", () => {
    const markup = markupFor([idleRegistryNetwork]);

    expect(markup).toContain("—");
    expect(markup).not.toContain("0s");
  });

  it("shows the age of the newest activity of a network that was seen", () => {
    const markup = markupFor([activeNetwork]);

    expect(markup).toContain(">42s<");
  });

  it("shows the observed volume without an estimate badge", () => {
    const markup = markupFor([activeNetwork]);

    expect(markup).toContain("$5.4K");
    expect(markup).not.toContain(">est.<");
  });

  it("counts bridge legs in both directions", () => {
    const markup = markupFor([activeNetwork]);

    expect(markup).toContain("12 / 7");
  });

  it("carries no inline styles", () => {
    const markup = markupFor([activeNetwork, idleRegistryNetwork]);

    expect(markup).not.toContain("style=");
  });
});

describe("NetworksTable column priority below the md breakpoint", () => {
  it("keeps network, verification, observed volume and txns on a phone", () => {
    const markup = markupFor([activeNetwork]);

    expect(headersShownBelowMd(markup)).toEqual([
      "Network",
      "Verification",
      "Observed volume",
      "Txns",
    ]);
  });

  it("drops the bridge legs and last seen on a phone", () => {
    const markup = markupFor([activeNetwork]);

    expect(headersHiddenBelowMd(markup)).toEqual(["Bridge in / out", "Last seen"]);
  });

  it("drops the body cells of exactly the two columns its header drops", () => {
    const markup = markupFor([activeNetwork]);

    expect(bodyCellsHiddenBelowMd(markup)).toEqual([false, false, false, false, true, true]);
  });
});
