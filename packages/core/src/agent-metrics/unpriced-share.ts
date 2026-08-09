import { deploysCapital, isServerPriced, type AgentActivity } from "./agent-activity.js";
import { trailingWindowStartSeconds } from "./utc-day-window.js";

const SHARE_DECIMALS = 10;

function declaresALegWithoutAPrice(activity: AgentActivity): boolean {
  if (activity.spent.usdPriced === null) return true;
  return activity.received.tokenAddress !== null && activity.received.usdPriced === null;
}

function couldNotBePriced(activity: AgentActivity): boolean {
  if (activity.pricingState === "unpriced") return true;
  return isServerPriced(activity) && declaresALegWithoutAPrice(activity);
}

function carriesPricedUsd(activity: AgentActivity): boolean {
  return isServerPriced(activity) && !declaresALegWithoutAPrice(activity);
}

export function unpricedSharePct(activities: readonly AgentActivity[]): number {
  const canCarryUsd = activities.filter(deploysCapital);
  const unpriced = canCarryUsd.filter(couldNotBePriced).length;
  const priced = canCarryUsd.filter(carriesPricedUsd).length;
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
