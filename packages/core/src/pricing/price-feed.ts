export type PriceQuery = { coinKey: string; atSecond: number };

export type PricePoint = { priceUsd: string; confidence: number; atSecond: number };

export interface PriceFeed {
  historical(queries: readonly PriceQuery[]): Promise<ReadonlyMap<string, PricePoint>>;
}
