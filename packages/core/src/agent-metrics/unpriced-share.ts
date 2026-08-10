import type { AgentActivity } from "./agent-activity.js";
import { usdContributionOf } from "./usd-contribution.js";
import { trailingWindowStartSeconds } from "./utc-day-window.js";

const SHARE_DECIMALS = 10;

export function unpricedSharePct(activities: readonly AgentActivity[]): number {
  const contributions = activities.map(usdContributionOf);
  const unpriced = contributions.filter((each) => each === "contributes_no_usd").length;
  const priced = contributions.filter((each) => each === "contributes_usd").length;
  const settled = unpriced + priced;
  if (settled === 0) return 0;
  return Math.round((unpriced / settled) * 100 * SHARE_DECIMALS) / SHARE_DECIMALS;
}

export function unpriced30dSharePct(
  activities: readonly AgentActivity[],
  nowSeconds: number,
): number {
  const windowStart = trailingWindowStartSeconds(nowSeconds);
  return unpricedSharePct(
    activities.filter((activity) => activity.observedAtSeconds >= windowStart),
  );
}
