import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import TokensPage from "../../app/tokens/page";
import type { TokenStatDto } from "../../lib/api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined, replace: () => undefined }),
  usePathname: () => "/tokens",
  useSearchParams: () => new URLSearchParams(),
}));

const tokens: TokenStatDto[] = [
  {
    chainSlug: "base",
    address: "0xaaa1",
    symbol: "USDC",
    volumeUsd: "1000",
    txCount: 1,
    agentCount: 1,
    protocols: ["kyberswap"],
    lastSeenSeconds: 60,
    series: [{ bucketStart: 1, volumeUsd: "1000", txCount: 1 }],
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

describe("TokensPage", () => {
  it("offers load more while the listing has another page", async () => {
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const path = new URL(String(input), "http://localhost:3000").pathname;
      if (path === "/api/tokens") {
        return jsonResponse({ items: tokens, nextCursor: "cursor-1" });
      }
      throw new Error(`unseeded endpoint ${path}`);
    });

    const html = renderToStaticMarkup(
      await TokensPage({ searchParams: Promise.resolve({ range: "30d" }) }),
    );

    expect(html).toContain("USDC");
    expect(html).toContain(">Load more</button>");
  });
});
