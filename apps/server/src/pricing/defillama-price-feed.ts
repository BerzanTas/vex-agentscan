import { z } from "zod";
import { plainDecimalFrom, type PriceFeed, type PricePoint, type PriceQuery } from "@agentscan/core";
import type { Config } from "../config.js";

export const DEFILLAMA_PRICE_SOURCE = "defillama";

export class PriceFeedUnavailableError extends Error {
  constructor(reason: string, options?: { cause: unknown }) {
    super(`price feed unavailable: ${reason}`, options);
    this.name = "PriceFeedUnavailableError";
  }
}

const coinQuoteSchema = z.object({
  price: z.number(),
  timestamp: z.number(),
  confidence: z.number().optional(),
});

const historicalResponseSchema = z.object({ coins: z.record(z.string(), z.unknown()) });

function chunked<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function coinKeysBySecond(queries: readonly PriceQuery[]): Map<number, string[]> {
  const bySecond = new Map<number, string[]>();
  for (const query of queries) {
    const coinKeys = bySecond.get(query.atSecond) ?? [];
    if (!coinKeys.includes(query.coinKey)) coinKeys.push(query.coinKey);
    bySecond.set(query.atSecond, coinKeys);
  }
  return bySecond;
}

function pricePointFrom(quote: unknown): PricePoint | null {
  const parsed = coinQuoteSchema.safeParse(quote);
  if (!parsed.success) return null;
  const priceUsd = plainDecimalFrom(parsed.data.price);
  if (priceUsd === null) return null;
  return { priceUsd, confidence: parsed.data.confidence ?? 0, atSecond: parsed.data.timestamp };
}

export function makeDefiLlamaPriceFeed(config: Config): PriceFeed {
  async function readBatch(atSecond: number, coinKeys: string[], into: Map<string, PricePoint>): Promise<void> {
    const url = `${config.PRICE_FEED_BASE_URL}/prices/historical/${atSecond}/${coinKeys.join(",")}`;
    const response = await requestJson(url);
    const parsed = historicalResponseSchema.safeParse(response);
    if (!parsed.success) throw new PriceFeedUnavailableError("unexpected response body");
    const quotes = Object.entries(parsed.data.coins);
    let recognisedQuotes = 0;
    for (const [coinKey, quote] of quotes) {
      const point = pricePointFrom(quote);
      if (point === null) continue;
      recognisedQuotes += 1;
      into.set(coinKey, point);
    }
    if (quotes.length > 0 && recognisedQuotes === 0) {
      throw new PriceFeedUnavailableError("no quote matched the documented shape");
    }
  }

  async function requestJson(url: string): Promise<unknown> {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(config.PRICE_FEED_TIMEOUT_MS),
      });
      if (!response.ok) throw new PriceFeedUnavailableError(`status ${response.status}`);
      return await response.json();
    } catch (error) {
      if (error instanceof PriceFeedUnavailableError) throw error;
      throw new PriceFeedUnavailableError("request failed", { cause: error });
    }
  }

  return {
    async historical(queries) {
      const points = new Map<string, PricePoint>();
      for (const [atSecond, coinKeys] of coinKeysBySecond(queries)) {
        for (const chunk of chunked(coinKeys, config.PRICE_FEED_COINS_PER_REQUEST)) {
          await readBatch(atSecond, chunk, points);
        }
      }
      return points;
    },
  };
}
