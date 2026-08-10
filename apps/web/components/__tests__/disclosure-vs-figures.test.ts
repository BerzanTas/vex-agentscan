import { describe, expect, it, afterEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import type { UsdContribution } from "@agentscan/core";
import DashboardPage from "../../app/page";
import AgentsPage from "../../app/agents/page";
import ProtocolsPage from "../../app/protocols/page";
import TokensPage from "../../app/tokens/page";
import NetworksPage from "../../app/networks/page";
import AgentProfilePage from "../../app/agent/[name]/page";
import TokenDetailPage from "../../app/tokens/[chainSlug]/[address]/page";
import NetworkDetailPage from "../../app/networks/[slug]/page";
import type {
  ActivityFeedDto,
  AgentPageDto,
  AgentStatDto,
  BridgeRouteDto,
  ChartPointDto,
  NetworkDetailDto,
  NetworkStatDto,
  ProtocolRankingDto,
  ProtocolStatDto,
  StatsDto,
  TokenDetailDto,
  TokenStatDto,
} from "../../lib/api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined, replace: () => undefined }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("the surface answered 404 for a seeded fixture");
  },
}));

const USD_CONTRIBUTIONS: UsdContribution[] = [
  "contributes_usd",
  "contributes_no_usd",
  "awaiting_a_price",
  "outside_usd_figures",
];

type SurfaceId =
  | "/"
  | "/agents"
  | "/protocols"
  | "/tokens"
  | "/networks"
  | "/agent/[name]"
  | "/tokens/[chainSlug]/[address]"
  | "/networks/[slug]";

type SilentQualifier = {
  silentBecause: string;
  claiming: string;
  inSentences: number;
};

type Qualifier = { names: readonly string[] } | SilentQualifier;

const MEASURED_POPULATION = "bridge deposit";

const AGENT_PAGE_SILENCE: SilentQualifier = {
  silentBecause: "F4",
  claiming: "could not be fully priced",
  inSentences: 3,
};

const AGENT_PAGE_WORDS: Record<UsdContribution, Qualifier> = {
  contributes_usd: { names: [MEASURED_POPULATION, "could not be fully priced"] },
  contributes_no_usd: {
    names: [
      MEASURED_POPULATION,
      "could not be fully priced",
      "not fully reflected in the realized result",
      "not fully reflected in the capital deployed figure",
    ],
  },
  awaiting_a_price: { names: [MEASURED_POPULATION, "still being priced"] },
  outside_usd_figures: AGENT_PAGE_SILENCE,
};

function agentPageFor(state: UsdContribution): AgentPageDto {
  const base: AgentPageDto = {
    name: "Vex-9f2a41c8",
    capitalDeployedPeak30dUsd: "1000",
    dailyDeployedUsd: Array.from({ length: 30 }, (_unused, index) => ({
      day: new Date(Date.UTC(2026, 6, 11) + index * 86_400_000).toISOString().slice(0, 10),
      usd: index === 29 ? "1000" : "0",
    })),
    realizedResultUsd: "0",
    closedRoundTrips: 0,
    unmatchedDisposals: 0,
    winRate: null,
    protocolBreakdown: [{ protocol: "kyberswap", volumeUsd: "1000", txCount: 1 }],
    chainBreakdown: [{ chainSlug: "base", volumeUsd: "1000", txCount: 1 }],
    activityCount: 1,
    activitiesPerDay30d: 0.03,
    firstSeenSeconds: 7200,
    lastSeenSeconds: 3600,
    unpricedSharePct: 0,
    unpriced30dSharePct: 0,
    awaitingAPriceCount: 0,
    truncated: false,
  };
  switch (state) {
    case "contributes_usd":
      return base;
    case "contributes_no_usd":
      return { ...base, unpricedSharePct: 100, unpriced30dSharePct: 100 };
    case "awaiting_a_price":
      return { ...base, awaitingAPriceCount: 1, activityCount: 2 };
    case "outside_usd_figures":
      return {
        ...base,
        capitalDeployedPeak30dUsd: "0",
        protocolBreakdown: [{ protocol: "relay", volumeUsd: "0", txCount: 2 }],
        chainBreakdown: [{ chainSlug: "base", volumeUsd: "0", txCount: 2 }],
        activityCount: 2,
      };
    default: {
      const unpricedState: never = state;
      throw new Error(`no agent page seed for ${String(unpricedState)}`);
    }
  }
}

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

const protocols: ProtocolStatDto[] = [{ protocol: "kyberswap", volumeUsd: "1000", txCount: 1 }];

const protocolRanking: ProtocolRankingDto[] = [
  { protocol: "kyberswap", volumeUsd: "1000", txCount: 1, chainCount: 1, swapTxCount: 1, bridgeTxCount: 0 },
];

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

const activity: ActivityFeedDto = { items: [], nextCursor: null };

const tokens: TokenStatDto[] = [
  {
    chainSlug: "base",
    address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    symbol: "USDC",
    volumeUsd: "1000",
    txCount: 1,
    agentCount: 1,
    protocols: ["kyberswap"],
    lastSeenSeconds: 3600,
    series: chart,
  },
];

const tokenDetail: TokenDetailDto = {
  chainSlug: "base",
  address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  symbol: "USDC",
  decimals: 6,
  volumeUsd: "1000",
  txCount: 1,
  agentCount: 1,
  protocols,
  pairs: [],
  series: chart,
};

const networks: NetworkStatDto[] = [
  {
    chainSlug: "base",
    displayName: "Base",
    verificationTier: "full",
    volumeUsd: "1000",
    txCount: 1,
    bridgeInCount: 0,
    bridgeOutCount: 0,
    lastSeenSeconds: 3600,
  },
];

const networkDetail: NetworkDetailDto = {
  chainSlug: "base",
  displayName: "Base",
  verificationTier: "full",
  volumeUsd: "1000",
  txCount: 1,
  protocols,
  tokens: [{ address: "0x8335", symbol: "USDC", volumeUsd: "1000", txCount: 1 }],
  routes: [],
  series: chart,
};

const routes: BridgeRouteDto[] = [
  { fromChainSlug: "base", toChainSlug: "arbitrum", legCount: 1, volumeUsd: "1000" },
];

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function serveApi(state: UsdContribution): void {
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const path = new URL(String(input), "http://localhost:3000").pathname;
    if (path === "/api/stats") return jsonResponse(stats);
    if (path === "/api/chart") return jsonResponse(chart);
    if (path === "/api/protocols") return jsonResponse(protocols);
    if (path === "/api/protocols/ranking") return jsonResponse(protocolRanking);
    if (path === "/api/agents") return jsonResponse(agents);
    if (path.startsWith("/api/agents/")) return jsonResponse(agentPageFor(state));
    if (path === "/api/activity") return jsonResponse(activity);
    if (path === "/api/tokens") return jsonResponse(tokens);
    if (path.startsWith("/api/tokens/")) return jsonResponse(tokenDetail);
    if (path === "/api/networks") return jsonResponse(networks);
    if (path.startsWith("/api/networks/")) return jsonResponse(networkDetail);
    if (path === "/api/routes") return jsonResponse(routes);
    throw new Error(`unseeded endpoint ${path}`);
  });
}

async function renderSurface(surface: SurfaceId): Promise<string> {
  const searchParams = Promise.resolve({});
  const element = await surfaceElement(surface, searchParams);
  return renderToStaticMarkup(element);
}

async function surfaceElement(
  surface: SurfaceId,
  searchParams: Promise<Record<string, string | string[] | undefined>>,
): Promise<ReactElement> {
  switch (surface) {
    case "/":
      return DashboardPage();
    case "/agents":
      return AgentsPage({ searchParams });
    case "/protocols":
      return ProtocolsPage({ searchParams });
    case "/tokens":
      return TokensPage({ searchParams });
    case "/networks":
      return NetworksPage({ searchParams });
    case "/agent/[name]":
      return AgentProfilePage({ params: Promise.resolve({ name: "Vex-9f2a41c8" }) });
    case "/tokens/[chainSlug]/[address]":
      return TokenDetailPage({
        params: Promise.resolve({ chainSlug: "base", address: "0x8335" }),
        searchParams,
      });
    case "/networks/[slug]":
      return NetworkDetailPage({ params: Promise.resolve({ slug: "base" }), searchParams });
    default: {
      const unreachableSurface: never = surface;
      throw new Error(`no renderer for ${String(unreachableSurface)}`);
    }
  }
}

const SURFACES: SurfaceId[] = [
  "/",
  "/agents",
  "/protocols",
  "/tokens",
  "/networks",
  "/agent/[name]",
  "/tokens/[chainSlug]/[address]",
  "/networks/[slug]",
];

function visibleText(markup: string): string {
  return markup.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
}

function sentenceCount(paragraph: string): number {
  return paragraph.split(".").filter((sentence) => sentence.trim() !== "").length;
}

function qualifierParagraphs(markup: string): string[] {
  return [...markup.matchAll(/<p class="[^"]*max-w-3xl text-xs text-text-muted">(.*?)<\/p>/g)].map(
    (match) => visibleText(match[1] ?? "").trim(),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/agent/[name] publishes USD", () => {
  it.each(USD_CONTRIBUTIONS)("names the %s state it renders, or is a recorded gap", async (state) => {
    serveApi(state);

    const markup = await renderSurface("/agent/[name]");
    const qualifier = AGENT_PAGE_WORDS[state];

    if ("silentBecause" in qualifier) {
      const claim = qualifierParagraphs(markup).find((paragraph) =>
        paragraph.includes(qualifier.claiming),
      );
      expect(claim).toBeDefined();
      expect(sentenceCount(claim ?? "")).toBe(qualifier.inSentences);
      return;
    }
    for (const phrase of qualifier.names) {
      expect(visibleText(markup)).toContain(phrase);
    }
  });
});

describe.each(SURFACES)("%s publishes USD", (surface) => {
  it("labels no aggregate USD figure as an estimate", async () => {
    serveApi("contributes_usd");

    const markup = await renderSurface(surface);

    expect(markup).not.toContain(">est.<");
  });

  it("leaves the priced-coverage share to the footer instead of a prose note", async () => {
    serveApi("contributes_usd");

    const markup = await renderSurface(surface);

    expect(markup).not.toContain("priced by AgentScan and cover");
    expect(markup).not.toContain("Across the whole explorer");
  });
});

describe.each(["/tokens", "/tokens/[chainSlug]/[address]"] as const)(
  "%s qualifies its observed volume",
  (surface) => {
    it("warns that the figure is agent activity rather than market volume", async () => {
      serveApi("contributes_usd");

      const markup = await renderSurface(surface);

      expect(visibleText(markup)).toContain("not market volume");
    });

    it("hangs the warning off the volume label instead of a prose block", async () => {
      serveApi("contributes_usd");

      const markup = await renderSurface(surface);

      expect(markup).toContain('aria-describedby="');
      expect(markup).toContain('class="figure-note-text"');
    });
  },
);

describe("the union of USD contributions", () => {
  it("has words on the agent page for every state that is not a recorded gap", () => {
    const silent = USD_CONTRIBUTIONS.filter((state) => "silentBecause" in AGENT_PAGE_WORDS[state]);

    expect(silent).toEqual(["outside_usd_figures"]);
  });
});
