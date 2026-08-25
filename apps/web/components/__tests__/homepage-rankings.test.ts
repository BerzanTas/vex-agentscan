import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DashboardPage from "../../app/page";
import type {
  ActivityFeedDto,
  AgentStatDto,
  ChartPointDto,
  ProtocolStatDto,
  StatsDto,
} from "../../lib/api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined, replace: () => undefined }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const stats: StatsDto = {
  dailyVolumeUsd: "1000",
  totalVolumeUsd: "1000",
  dailyTx: 1,
  totalTx: 1,
  activeAgents7d: 1,
};

const chart: ChartPointDto[] = [
  { bucketStart: Date.UTC(2026, 6, 11) / 1000, volumeUsd: "1000", txCount: 1 },
];

const protocols: ProtocolStatDto[] = Array.from({ length: 6 }, (_, index) => ({
  protocol: `protocol-${index}`,
  volumeUsd: String(600 - index * 10),
  txCount: 1,
}));

const agents: AgentStatDto[] = Array.from({ length: 6 }, (_, index) => ({
  alias: `agent-${index}`,
  name: null,
  volumeUsd: String(600 - index * 10),
  txCount: 1,
  protocolCount: 1,
  chainCount: 1,
  lastSeenSeconds: 60,
}));

const activity: ActivityFeedDto = { items: [], nextCursor: null };

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("homepage rankings", () => {
  it("keeps five protocol rows and five agent rows so the blocks match", async () => {
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const path = new URL(String(input), "http://localhost:3000").pathname;
      if (path === "/api/stats") return jsonResponse(stats);
      if (path === "/api/chart") return jsonResponse(chart);
      if (path === "/api/protocols") return jsonResponse(protocols);
      if (path === "/api/agents") {
        return jsonResponse({
          items: agents,
          nextCursor: "cursor-1",
          totalAllTime: 6,
          totalInWindow: 6,
        });
      }
      if (path === "/api/activity") return jsonResponse(activity);
      throw new Error(`unseeded endpoint ${path}`);
    });

    const html = renderToStaticMarkup(await DashboardPage());

    expect(html.match(/ranking-row/g)).toHaveLength(10);
    expect(html).toContain("protocol-0");
    expect(html).toContain("protocol-4");
    expect(html).not.toContain("protocol-5");
    expect(html).toContain("agent-0");
    expect(html).toContain("agent-4");
    expect(html).not.toContain("agent-5");
  });

  it("links each ranking block to its full page", async () => {
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const path = new URL(String(input), "http://localhost:3000").pathname;
      if (path === "/api/stats") return jsonResponse(stats);
      if (path === "/api/chart") return jsonResponse(chart);
      if (path === "/api/protocols") return jsonResponse(protocols);
      if (path === "/api/agents") {
        return jsonResponse({
          items: agents,
          nextCursor: null,
          totalAllTime: 6,
          totalInWindow: 6,
        });
      }
      if (path === "/api/activity") return jsonResponse(activity);
      throw new Error(`unseeded endpoint ${path}`);
    });

    const html = renderToStaticMarkup(await DashboardPage());

    expect(html).toContain('href="/protocols"');
    expect(html).toContain("View all protocols");
    expect(html).toContain('href="/agents"');
    expect(html).toContain("View all agents");
  });
});
