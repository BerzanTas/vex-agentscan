import type { AgentActivity } from "./agent-activity.js";
import { TRAILING_WINDOW_DAYS, trailingWindowStartSeconds } from "./utc-day-window.js";

const CADENCE_DECIMALS = 100;

export function activitiesPerDay30d(
  activities: readonly AgentActivity[],
  nowSeconds: number,
): number {
  const windowStart = trailingWindowStartSeconds(nowSeconds);
  const withinWindow = activities.filter(
    (activity) => activity.observedAtSeconds >= windowStart,
  ).length;
  return Math.round((withinWindow / TRAILING_WINDOW_DAYS) * CADENCE_DECIMALS) / CADENCE_DECIMALS;
}
