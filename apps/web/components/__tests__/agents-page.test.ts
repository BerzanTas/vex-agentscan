import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AgentsPage from "../../app/agents/page";
import type { AgentStatDto } from "../../lib/api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined, replace: () => undefined }),
  usePathname: () => "/agents",
  useSearchParams: () => new URLSearchParams(),
}));

const agents: AgentStatDto[] = [
  {
    alias: "quiet-otter-1f3a",
    name: "Vex-9f2a41c8",
    volumeUsd: "1000",
    txCount: 1,
    protocolCount: 1,
    chainCount: 1,
    lastSeenSeconds: 3600,
  },
];

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AgentsPage", () => {
  it("places all-time and in-window counts above the ranking", async () => {
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const path = new URL(String(input), "http://localhost:3000").pathname;
      if (path === "/api/agents") {
        return jsonResponse({
          items: agents,
          nextCursor: "cursor-1",
          totalAllTime: 1284,
          totalInWindow: 12,
        });
      }
      throw new Error(`unseeded endpoint ${path}`);
    });

    const html = renderToStaticMarkup(
      await AgentsPage({ searchParams: Promise.resolve({ range: "30d" }) }),
    );

    expect(html).toContain("Agents");
    expect(html).toContain("In this window");
    expect(html).toContain("1,284");
    expect(html).toContain("12");
    expect(html).toContain("30D");
    expect(html).toContain(">Load more</button>");
  });
});
