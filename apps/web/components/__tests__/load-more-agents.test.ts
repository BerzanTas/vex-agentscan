import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LoadMoreAgents, appendAgentsPage } from "../LoadMoreAgents";
import type { AgentStatDto } from "../../lib/api";

function agentWithAlias(alias: string): AgentStatDto {
  return {
    alias,
    name: null,
    volumeUsd: "100",
    txCount: 1,
    protocolCount: 1,
    chainCount: 1,
    lastSeenSeconds: 60,
  };
}

function markupFor(initialItems: AgentStatDto[], initialCursor: string | null): string {
  return renderToStaticMarkup(
    createElement(LoadMoreAgents, { initialItems, initialCursor, range: "30d" }),
  );
}

describe("appendAgentsPage", () => {
  it("keeps the already loaded rows ahead of the fetched page", () => {
    const merged = appendAgentsPage(
      { rows: [agentWithAlias("agent-1")], nextCursor: "cursor-1" },
      {
        items: [agentWithAlias("agent-2")],
        nextCursor: "cursor-2",
        totalAllTime: 3,
        totalInWindow: 3,
      },
    );

    expect(merged.rows.map((row) => row.alias)).toEqual(["agent-1", "agent-2"]);
  });

  it("advances the cursor to the one the fetched page carries", () => {
    const merged = appendAgentsPage(
      { rows: [agentWithAlias("agent-1")], nextCursor: "cursor-1" },
      {
        items: [agentWithAlias("agent-2")],
        nextCursor: "cursor-2",
        totalAllTime: 3,
        totalInWindow: 3,
      },
    );

    expect(merged.nextCursor).toBe("cursor-2");
  });

  it("ends the ranking when the fetched page has no next cursor", () => {
    const merged = appendAgentsPage(
      { rows: [agentWithAlias("agent-1")], nextCursor: "cursor-1" },
      {
        items: [agentWithAlias("agent-2")],
        nextCursor: null,
        totalAllTime: 2,
        totalInWindow: 2,
      },
    );

    expect(merged.nextCursor).toBeNull();
  });
});

describe("LoadMoreAgents", () => {
  it("offers the load more button while a next cursor exists", () => {
    const markup = markupFor([agentWithAlias("agent-1")], "cursor-1");

    expect(markup).toContain(">Load more</button>");
  });

  it("omits the load more button at the end of the ranking", () => {
    const markup = markupFor([agentWithAlias("agent-1")], null);

    expect(markup).not.toContain("<button");
  });

  it("shows the ranking empty state instead of a table when there are no rows", () => {
    const markup = markupFor([], null);

    expect(markup).toContain("No verified agent activity yet");
    expect(markup).not.toContain("<table");
  });

  it("numbers the first loaded row as 1", () => {
    const markup = markupFor([agentWithAlias("agent-1"), agentWithAlias("agent-2")], "cursor-1");

    expect(markup).toMatch(/<td class="[^"]*">1<\/td>/);
    expect(markup).toMatch(/<td class="[^"]*">2<\/td>/);
  });
});
