import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { makeDefiLlamaPriceFeed, PriceFeedUnavailableError } from "../pricing/defillama-price-feed.js";

const config = loadConfig({ DATABASE_URL: "postgres://unused", PRICE_FEED_COINS_PER_REQUEST: "2" });
const atSecond = 1_785_837_600;

function stubFetch(respond: (url: string) => Response | Promise<Response>): { urls: string[] } {
  const urls: string[] = [];
  vi.stubGlobal("fetch", (input: string) => {
    urls.push(input);
    return Promise.resolve(respond(input));
  });
  return { urls };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("makeDefiLlamaPriceFeed", () => {
  it("requests the historical endpoint with the anchor second and comma-separated coins", async () => {
    const { urls } = stubFetch(() => jsonResponse({ coins: {} }));

    await makeDefiLlamaPriceFeed(config).historical([
      { coinKey: "base:0xaaa", atSecond },
      { coinKey: "base:0xbbb", atSecond },
    ]);

    expect(urls).toEqual([`https://coins.llama.fi/prices/historical/${atSecond}/base:0xaaa,base:0xbbb`]);
  });

  it("splits the coin list into requests of at most PRICE_FEED_COINS_PER_REQUEST", async () => {
    const { urls } = stubFetch(() => jsonResponse({ coins: {} }));

    await makeDefiLlamaPriceFeed(config).historical([
      { coinKey: "base:0xaaa", atSecond },
      { coinKey: "base:0xbbb", atSecond },
      { coinKey: "base:0xccc", atSecond },
    ]);

    expect(urls).toEqual([
      `https://coins.llama.fi/prices/historical/${atSecond}/base:0xaaa,base:0xbbb`,
      `https://coins.llama.fi/prices/historical/${atSecond}/base:0xccc`,
    ]);
  });

  it("issues one request per distinct anchor second", async () => {
    const { urls } = stubFetch(() => jsonResponse({ coins: {} }));

    await makeDefiLlamaPriceFeed(config).historical([
      { coinKey: "base:0xaaa", atSecond },
      { coinKey: "base:0xaaa", atSecond: atSecond + 3600 },
    ]);

    expect(urls).toEqual([
      `https://coins.llama.fi/prices/historical/${atSecond}/base:0xaaa`,
      `https://coins.llama.fi/prices/historical/${atSecond + 3600}/base:0xaaa`,
    ]);
  });

  it("maps a quote to a price point carrying a plain decimal price", async () => {
    stubFetch(() =>
      jsonResponse({
        coins: { "base:0xaaa": { decimals: 18, symbol: "WETH", price: 1.2345e-7, timestamp: atSecond, confidence: 0.99 } },
      }),
    );

    const points = await makeDefiLlamaPriceFeed(config).historical([{ coinKey: "base:0xaaa", atSecond }]);

    expect(points.get("base:0xaaa")).toEqual({ priceUsd: "0.00000012345", confidence: 0.99, atSecond });
  });

  it("reports a quote without confidence as zero confidence so the gate rejects it", async () => {
    stubFetch(() => jsonResponse({ coins: { "base:0xaaa": { price: 2500, timestamp: atSecond } } }));

    const points = await makeDefiLlamaPriceFeed(config).historical([{ coinKey: "base:0xaaa", atSecond }]);

    expect(points.get("base:0xaaa")).toEqual({ priceUsd: "2500", confidence: 0, atSecond });
  });

  it("omits a single unrecognised quote while keeping the rest of the batch", async () => {
    stubFetch(() =>
      jsonResponse({
        coins: {
          "base:0xaaa": { price: "2500", timestamp: atSecond },
          "base:0xbbb": { price: 1, timestamp: atSecond, confidence: 0.99 },
        },
      }),
    );

    const points = await makeDefiLlamaPriceFeed(config).historical([
      { coinKey: "base:0xaaa", atSecond },
      { coinKey: "base:0xbbb", atSecond },
    ]);

    expect([...points.keys()]).toEqual(["base:0xbbb"]);
  });

  it("reports an unavailable feed when the answer holds quotes but none match the documented shape", async () => {
    stubFetch(() => jsonResponse({ coins: { "base:0xaaa": { price: "2500", timestamp: atSecond } } }));

    await expect(
      makeDefiLlamaPriceFeed(config).historical([{ coinKey: "base:0xaaa", atSecond }]),
    ).rejects.toBeInstanceOf(PriceFeedUnavailableError);
  });

  it("treats an empty coins object as a genuine miss rather than an outage", async () => {
    stubFetch(() => jsonResponse({ coins: {} }));

    const points = await makeDefiLlamaPriceFeed(config).historical([{ coinKey: "base:0xaaa", atSecond }]);

    expect(points.size).toBe(0);
  });

  it("reports an unavailable feed when the endpoint answers with an error status", async () => {
    stubFetch(() => new Response("", { status: 502 }));

    await expect(
      makeDefiLlamaPriceFeed(config).historical([{ coinKey: "base:0xaaa", atSecond }]),
    ).rejects.toBeInstanceOf(PriceFeedUnavailableError);
  });

  it("reports an unavailable feed when the transport fails", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("ECONNRESET")));

    await expect(
      makeDefiLlamaPriceFeed(config).historical([{ coinKey: "base:0xaaa", atSecond }]),
    ).rejects.toBeInstanceOf(PriceFeedUnavailableError);
  });

  it("reports an unavailable feed when the body is not the documented envelope", async () => {
    stubFetch(() => jsonResponse({ unexpected: true }));

    await expect(
      makeDefiLlamaPriceFeed(config).historical([{ coinKey: "base:0xaaa", atSecond }]),
    ).rejects.toBeInstanceOf(PriceFeedUnavailableError);
  });
});
