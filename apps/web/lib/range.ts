import { DEFAULT_CHART_RANGE, type ChartRange } from "./api";

const CHART_RANGES: ChartRange[] = ["24h", "7d", "30d", "all"];

export function parseChartRange(raw: string | string[] | undefined): ChartRange {
  if (typeof raw !== "string") return DEFAULT_CHART_RANGE;
  const match = CHART_RANGES.find((range) => range === raw);
  return match ?? DEFAULT_CHART_RANGE;
}
