import { deploysCapital, isServerPriced, type AgentActivity } from "./agent-activity.js";

export type UsdContribution =
  | "contributes_usd"
  | "contributes_no_usd"
  | "awaiting_a_price"
  | "outside_usd_figures";

function declaresALegWithoutAPrice(activity: AgentActivity): boolean {
  if (activity.spent.usdPriced === null) return true;
  return activity.received.tokenAddress !== null && activity.received.usdPriced === null;
}

function couldNotBePriced(activity: AgentActivity): boolean {
  if (activity.pricingState === "unpriced") return true;
  return isServerPriced(activity) && declaresALegWithoutAPrice(activity);
}

export function usdContributionOf(activity: AgentActivity): UsdContribution {
  if (!deploysCapital(activity)) return "outside_usd_figures";
  if (activity.pricingState === "pending") return "awaiting_a_price";
  return couldNotBePriced(activity) ? "contributes_no_usd" : "contributes_usd";
}

export function awaitingAPriceCount(activities: readonly AgentActivity[]): number {
  return activities.filter((activity) => usdContributionOf(activity) === "awaiting_a_price").length;
}
