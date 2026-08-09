import { deploysCapital, isServerPriced, type AgentActivity } from "./agent-activity.js";
import {
  ZERO_DECIMAL,
  addDecimal,
  decimalFromText,
  decimalToText,
  type Decimal,
} from "./decimal.js";
import { trailingWindowDays, utcDayOf } from "./utc-day-window.js";

export type DailyDeployed = { day: string; usd: string };

export type CapitalDeployed = { peakUsd: string; daily: DailyDeployed[] };

function deployedUsdOf(activity: AgentActivity): Decimal | null {
  if (!isServerPriced(activity) || !deploysCapital(activity)) return null;
  if (activity.spent.usdPriced === null) return null;
  return decimalFromText(activity.spent.usdPriced);
}

function deployedByDay(activities: readonly AgentActivity[]): Map<string, Decimal> {
  const totals = new Map<string, Decimal>();
  for (const activity of activities) {
    const usd = deployedUsdOf(activity);
    if (usd === null) continue;
    const day = utcDayOf(activity.observedAtSeconds);
    totals.set(day, addDecimal(totals.get(day) ?? ZERO_DECIMAL, usd));
  }
  return totals;
}

export function capitalDeployed(
  activities: readonly AgentActivity[],
  nowSeconds: number,
): CapitalDeployed {
  const totals = deployedByDay(activities);
  const daily = trailingWindowDays(nowSeconds).map((day) => ({
    day,
    total: totals.get(day) ?? ZERO_DECIMAL,
  }));
  const peak = daily.reduce(
    (highest, point) => (point.total > highest ? point.total : highest),
    ZERO_DECIMAL,
  );
  return {
    peakUsd: decimalToText(peak),
    daily: daily.map((point) => ({ day: point.day, usd: decimalToText(point.total) })),
  };
}
