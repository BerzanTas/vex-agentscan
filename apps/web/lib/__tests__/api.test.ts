import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVITY_VERIFICATION_FILTERS,
  activityPath,
  agentPagePath,
  agentsPath,
  chartPath,
  fetchAgentPage,
  DEFAULT_CHART_RANGE,
  fetchNetworkDetail,
  fetchProtocolRanking,
  fetchProtocols,
  fetchStats,
  fetchTokenDetail,
  fetchTxDetail,
  networkDetailPath,
  networksPath,
  protocolRankingPath,
  protocolsPath,
  routesPath,
  tokenDetailPath,
  tokensPath,
  verificationPath,
} from "../api.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(implementation: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(implementation));
}

function stubFetchCapturingUrl(): { requested: string[] } {
  const requested: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      requested.push(url);
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
  return { requested };
}

describe("fetchStats", () => {
  it("rzuca, gdy API jest nieosiągalne, zamiast zwracać zera", async () => {
    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(fetchStats()).rejects.toThrow();
  });

  it("rzuca, gdy API odpowiada błędem", async () => {
    stubFetch(async () => new Response("nope", { status: 503 }));
    await expect(fetchStats()).rejects.toThrow();
  });
});

describe("fetchTxDetail", () => {
  it("zwraca null wyłącznie dla statusu 404", async () => {
    stubFetch(async () => new Response("", { status: 404 }));
    await expect(fetchTxDetail("pub-1")).resolves.toBeNull();
  });

  it("rzuca, gdy API jest nieosiągalne, zamiast udawać brak transakcji", async () => {
    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(fetchTxDetail("pub-1")).rejects.toThrow();
  });
});

describe("chartPath", () => {
  it("builds a relative path carrying the range", () => {
    expect(chartPath("24h")).toBe("/api/chart?range=24h");
  });

  it("builds the path for the all-time range", () => {
    expect(chartPath("all")).toBe("/api/chart?range=all");
  });
});

describe("DEFAULT_CHART_RANGE", () => {
  it("is 30d so the first paint matches today's behaviour", () => {
    expect(DEFAULT_CHART_RANGE).toBe("30d");
  });
});

describe("tokensPath", () => {
  it("carries the range", () => {
    expect(tokensPath("24h")).toBe("/api/tokens?range=24h");
  });

  it("appends the limit after the range", () => {
    expect(tokensPath("7d", 25)).toBe("/api/tokens?range=7d&limit=25");
  });

  it("omits the limit when it is not asked for", () => {
    expect(tokensPath("all")).toBe("/api/tokens?range=all");
  });
});

describe("tokenDetailPath", () => {
  it("puts the chain and the address into the path", () => {
    expect(tokenDetailPath("base", "0xabc", "30d")).toBe("/api/tokens/base/0xabc?range=30d");
  });

  it("keeps an upper-case address unchanged because normalising is the server's job", () => {
    expect(tokenDetailPath("base", "0xAbCdEf", "30d")).toBe("/api/tokens/base/0xAbCdEf?range=30d");
  });

  it("encodes a slash in the address instead of forging a path segment", () => {
    expect(tokenDetailPath("base", "a/b", "24h")).toBe("/api/tokens/base/a%2Fb?range=24h");
  });
});

describe("networksPath", () => {
  it("carries the range", () => {
    expect(networksPath("7d")).toBe("/api/networks?range=7d");
  });
});

describe("networkDetailPath", () => {
  it("puts the slug into the path and the range into the query", () => {
    expect(networkDetailPath("arb", "all")).toBe("/api/networks/arb?range=all");
  });

  it("encodes the slug", () => {
    expect(networkDetailPath("a b", "24h")).toBe("/api/networks/a%20b?range=24h");
  });
});

describe("routesPath", () => {
  it("carries the range", () => {
    expect(routesPath("30d")).toBe("/api/routes?range=30d");
  });
});

describe("verificationPath", () => {
  it("takes no window, because the page reports capability and queue state", () => {
    expect(verificationPath()).toBe("/api/verification");
  });
});

describe("protocolsPath", () => {
  it("asks the purge durable aggregate endpoint, which has no window", () => {
    expect(protocolsPath()).toBe("/api/protocols");
  });
});

describe("protocolRankingPath", () => {
  it("carries the range to the windowed ranking endpoint", () => {
    expect(protocolRankingPath("24h")).toBe("/api/protocols/ranking?range=24h");
  });
});

describe("agentsPath", () => {
  it("carries the range", () => {
    expect(agentsPath("all")).toBe("/api/agents?range=all");
  });

  it("carries a homepage limit", () => {
    expect(agentsPath("30d", { limit: 5 })).toBe("/api/agents?range=30d&limit=5");
  });

  it("encodes the cursor into the next page path", () => {
    expect(agentsPath("7d", { cursor: "cur-1" })).toBe("/api/agents?range=7d&cursor=cur-1");
  });
});

describe("agentPagePath", () => {
  it("puts the public name into the path and carries no window", () => {
    expect(agentPagePath("Vex-9f2a41c8")).toBe("/api/agents/Vex-9f2a41c8");
  });

  it("keeps the name case, because the server matches it exactly", () => {
    expect(agentPagePath("VEX-9F2A41C8")).toBe("/api/agents/VEX-9F2A41C8");
  });

  it("encodes a slash in the name instead of forging a path segment", () => {
    expect(agentPagePath("a/b")).toBe("/api/agents/a%2Fb");
  });
});

describe("fetchAgentPage", () => {
  it("returns null only for a 404, which is the unknown-agent answer", async () => {
    stubFetch(async () => new Response("", { status: 404 }));
    await expect(fetchAgentPage("Vex-9f2a41c8")).resolves.toBeNull();
  });

  it("throws on a server error instead of pretending the agent is unknown", async () => {
    stubFetch(async () => new Response("nope", { status: 503 }));
    await expect(fetchAgentPage("Vex-9f2a41c8")).rejects.toThrow();
  });
});

describe("activityPath", () => {
  it("builds the first page path without a cursor", () => {
    expect(activityPath()).toBe("/api/activity");
  });

  it("builds the unfiltered path for an empty filter set", () => {
    expect(activityPath({})).toBe("/api/activity");
  });

  it("encodes the cursor into the next page path", () => {
    expect(activityPath({}, "2026-08-06T10:00:00.000Z|42")).toBe(
      "/api/activity?cursor=2026-08-06T10%3A00%3A00.000Z%7C42",
    );
  });

  it("emits two filters in a stable order whatever order they were written in", () => {
    expect(activityPath({ status: "confirmed", kind: "swap" })).toBe(
      "/api/activity?kind=swap&status=confirmed",
    );
    expect(activityPath({ kind: "swap", status: "confirmed" })).toBe(
      "/api/activity?kind=swap&status=confirmed",
    );
  });

  it("keeps the cursor ahead of the filters", () => {
    expect(activityPath({ chain: "base" }, "cur-1")).toBe(
      "/api/activity?cursor=cur-1&chain=base",
    );
  });

  it("emits every dimension in the order of the endpoint contract", () => {
    expect(
      activityPath({
        verification: "verified_full",
        chain: "solana",
        status: "pending",
        protocol: "relay",
        kind: "bridge",
      }),
    ).toBe(
      "/api/activity?kind=bridge&protocol=relay&chain=solana&status=pending&verification=verified_full",
    );
  });

  it("encodes a protocol name that needs escaping", () => {
    expect(activityPath({ protocol: "a&b" })).toBe("/api/activity?protocol=a%26b");
  });
});

describe("ACTIVITY_VERIFICATION_FILTERS", () => {
  it("offers no mismatch value, because mismatch rows are never public", () => {
    expect(ACTIVITY_VERIFICATION_FILTERS).toStrictEqual([
      "verified_full",
      "verified_basic",
      "pending",
    ]);
  });
});

describe("fetchProtocols", () => {
  it("requests the aggregate endpoint, which carries no window", async () => {
    const { requested } = stubFetchCapturingUrl();
    await fetchProtocols();
    expect(requested).toStrictEqual(["http://localhost:3000/api/protocols"]);
  });

  it("requests the windowed ranking from its own endpoint", async () => {
    const { requested } = stubFetchCapturingUrl();
    await fetchProtocolRanking("24h");
    expect(requested).toStrictEqual([
      "http://localhost:3000/api/protocols/ranking?range=24h",
    ]);
  });
});

describe("fetchTokenDetail", () => {
  it("zwraca null wyłącznie dla statusu 404", async () => {
    stubFetch(async () => new Response("", { status: 404 }));
    await expect(fetchTokenDetail("base", "0xabc")).resolves.toBeNull();
  });

  it("rzuca, gdy API odpowiada błędem, zamiast udawać nieznany token", async () => {
    stubFetch(async () => new Response("nope", { status: 503 }));
    await expect(fetchTokenDetail("base", "0xabc")).rejects.toThrow();
  });
});

describe("fetchNetworkDetail", () => {
  it("zwraca null wyłącznie dla statusu 404", async () => {
    stubFetch(async () => new Response("", { status: 404 }));
    await expect(fetchNetworkDetail("arb")).resolves.toBeNull();
  });

  it("rzuca, gdy API odpowiada błędem, zamiast udawać nieznaną sieć", async () => {
    stubFetch(async () => new Response("nope", { status: 503 }));
    await expect(fetchNetworkDetail("arb")).rejects.toThrow();
  });
});
