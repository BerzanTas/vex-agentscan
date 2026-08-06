export type ChartRange = "24h" | "7d" | "30d" | "all";

export type ChartRangePlan =
  | { source: "activities"; bucketSeconds: number; bucketCount: number }
  | { source: "aggregates"; days: number | null };

const PLANS: Record<ChartRange, ChartRangePlan> = {
  "24h": { source: "activities", bucketSeconds: 3600, bucketCount: 24 },
  "7d": { source: "activities", bucketSeconds: 21600, bucketCount: 28 },
  "30d": { source: "aggregates", days: 30 },
  all: { source: "aggregates", days: null },
};

const DEFAULT_RANGE: ChartRange = "30d";

function isChartRange(raw: string | undefined): raw is ChartRange {
  return raw === "24h" || raw === "7d" || raw === "30d" || raw === "all";
}

export function resolveChartRange(raw: string | undefined): ChartRangePlan {
  return PLANS[isChartRange(raw) ? raw : DEFAULT_RANGE];
}
