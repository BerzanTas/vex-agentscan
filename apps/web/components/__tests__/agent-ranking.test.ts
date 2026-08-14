import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentRanking } from "../AgentRanking";
import type { AgentStatDto } from "../../lib/api";

const agent: AgentStatDto = {
  alias: "quiet-otter-1f3a",
  name: null,
  volumeUsd: "1284310.55",
  txCount: 412,
  protocolCount: 3,
  chainCount: 4,
  lastSeenSeconds: 7200,
};

function rankingMarkup(agents: AgentStatDto[]): string {
  return renderToStaticMarkup(createElement(AgentRanking, { agents }));
}

describe("AgentRanking", () => {
  it("names a bound agent the same way the leaderboard does", () => {
    const markup = rankingMarkup([{ ...agent, name: "Vex-9f2a41c8" }]);

    expect(markup).toContain("Vex-9f2a41c8");
    expect(markup).not.toContain("quiet-otter-1f3a");
  });

  it("links a bound agent to its public page", () => {
    const markup = rankingMarkup([{ ...agent, name: "Vex-9f2a41c8" }]);

    expect(markup).toContain('href="/agent/Vex-9f2a41c8"');
  });

  it("falls back to the alias, unlinked, for an unbound agent", () => {
    const markup = rankingMarkup([agent]);

    expect(markup).toContain("quiet-otter-1f3a");
    expect(markup).not.toContain("<a");
  });

  it("survives an API answer without the name field at all", () => {
    const rowFromApiWithoutName = {
      alias: "quiet-otter-1f3a",
      volumeUsd: "1284310.55",
      txCount: 412,
      protocolCount: 3,
      chainCount: 4,
      lastSeenSeconds: 7200,
    } as unknown as AgentStatDto;

    const markup = rankingMarkup([rowFromApiWithoutName]);

    expect(markup).toContain("quiet-otter-1f3a");
    expect(markup).not.toContain("undefined");
  });

  it("shows the empty message instead of a list when there are no agents", () => {
    const markup = rankingMarkup([]);

    expect(markup).toContain("No verified activity yet");
    expect(markup).not.toContain("<ol");
  });
});
