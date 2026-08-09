import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentsRankingTable } from "../AgentsRankingTable";
import { ProtocolsRankingTable } from "../ProtocolsRankingTable";
import type { AgentStatDto, ProtocolRankingDto } from "../../lib/api";

const agent: AgentStatDto = {
  alias: "quiet-otter-1f3a",
  volumeUsd: "1284310.55",
  txCount: 412,
  protocolCount: 3,
  chainCount: 4,
  lastSeenSeconds: 7200,
};

const protocol: ProtocolRankingDto = {
  protocol: "kyberswap",
  volumeUsd: "985420.10",
  txCount: 1200,
  chainCount: 5,
  swapTxCount: 900,
  bridgeTxCount: 300,
};

function agentsMarkup(agents: AgentStatDto[]): string {
  return renderToStaticMarkup(
    createElement(AgentsRankingTable, { agents, emptyMessage: "No verified agent activity yet" }),
  );
}

function protocolsMarkup(protocols: ProtocolRankingDto[]): string {
  return renderToStaticMarkup(
    createElement(ProtocolsRankingTable, { protocols, emptyMessage: "No verified activity yet" }),
  );
}

function headerLabels(markup: string): string[] {
  return [...markup.matchAll(/<th(?:\s[^>]*)?>(.*?)<\/th>/g)].map((match) => match[1] ?? "");
}

function countFrom(label: string): number {
  return Number(label.replace(/,/g, ""));
}

describe("AgentsRankingTable", () => {
  it("names its seven columns in order", () => {
    const markup = agentsMarkup([agent]);

    expect(headerLabels(markup)).toEqual([
      "#",
      "Agent",
      "Observed volume",
      "Txns",
      "Protocols",
      "Chains",
      "Last seen",
    ]);
  });

  it("renders the alias in mono as a pseudonym", () => {
    const markup = agentsMarkup([agent]);

    expect(markup).toMatch(/<td class="[^"]*font-mono[^"]*">quiet-otter-1f3a<\/td>/);
  });

  it("links no agent row anywhere, so no alias gets a permanent page", () => {
    const markup = agentsMarkup([agent]);

    expect(markup).not.toContain("<a");
    expect(markup).not.toContain("/agents/");
  });

  it("keeps the exact volume in the title and carries no estimate badge", () => {
    const markup = agentsMarkup([agent]);

    expect(markup).toContain('title="$1,284,310.55"');
    expect(markup).not.toContain(">est.<");
  });

  it("ranks the rows by their position in the list", () => {
    const markup = agentsMarkup([agent, { ...agent, alias: "brisk-heron-90c2" }]);

    expect(markup).toContain(">1</td>");
    expect(markup).toContain(">2</td>");
  });

  it("shows the empty message instead of a table when there are no agents", () => {
    const markup = agentsMarkup([]);

    expect(markup).toContain("No verified agent activity yet");
    expect(markup).not.toContain("<table");
  });

  it("carries no inline styles", () => {
    const markup = agentsMarkup([agent]);

    expect(markup).not.toContain("style=");
  });
});

describe("ProtocolsRankingTable", () => {
  it("names its six columns in order", () => {
    const markup = protocolsMarkup([protocol]);

    expect(headerLabels(markup)).toEqual([
      "#",
      "Protocol",
      "Observed volume",
      "Txns",
      "Chains",
      "Swap / bridge split",
    ]);
  });

  it("shows the protocol icon next to its name", () => {
    const markup = protocolsMarkup([protocol]);

    expect(markup).toContain('src="/protocols/kyberswap.svg"');
    expect(markup).toContain('class="protocol-name"');
  });

  it("renders the swap and bridge counts as parts summing to the row txn count", () => {
    const markup = protocolsMarkup([protocol]);

    const split = markup.match(
      /([\d,]+) swap and ([\d,]+) bridge of ([\d,]+) txns/,
    );
    expect(split).not.toBeNull();
    const [, swap = "", bridge = "", total = ""] = split ?? [];
    expect(countFrom(swap) + countFrom(bridge)).toBe(countFrom(total));
    expect(countFrom(total)).toBe(protocol.txCount);
  });

  it("labels the two split counts in the visible cell", () => {
    const markup = protocolsMarkup([protocol]);

    expect(markup).toContain("900 swap");
    expect(markup).toContain("300 bridge");
  });

  it("keeps the exact volume in the title and carries no estimate badge", () => {
    const markup = protocolsMarkup([protocol]);

    expect(markup).toContain('title="$985,420.10"');
    expect(markup).not.toContain(">est.<");
  });

  it("shows the empty message instead of a table when there are no protocols", () => {
    const markup = protocolsMarkup([]);

    expect(markup).toContain("No verified activity yet");
    expect(markup).not.toContain("<table");
  });

  it("carries no inline styles", () => {
    const markup = protocolsMarkup([protocol]);

    expect(markup).not.toContain("style=");
  });
});
