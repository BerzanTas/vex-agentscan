import type { AgentActivity } from "./agent-activity.js";

const SHARE_DECIMALS = 10;

export function unpricedSharePct(activities: readonly AgentActivity[]): number {
  const unpriced = activities.filter((activity) => activity.pricingState === "unpriced").length;
  const priced = activities.filter((activity) => activity.pricingState === "server_priced").length;
  const settled = unpriced + priced;
  if (settled === 0) return 0;
  return Math.round((unpriced / settled) * 100 * SHARE_DECIMALS) / SHARE_DECIMALS;
}
