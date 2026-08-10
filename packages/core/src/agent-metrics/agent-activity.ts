import { deploysCapitalRole } from "../capital-deploying-roles.js";
import type { ChainFamily } from "../chain-registry/catalog.js";

export type PricingState = "pending" | "server_priced" | "unpriced";

export type AgentActivityLeg = {
  tokenAddress: string | null;
  tokenDecimals: number | null;
  executedRaw: string | null;
  usdPriced: string | null;
};

export type AgentActivity = {
  activityId: bigint;
  observedAtSeconds: number;
  kind: string;
  eventRole: string;
  protocol: string;
  chainFamily: ChainFamily;
  chainId: bigint;
  pricingState: PricingState;
  spent: AgentActivityLeg;
  received: AgentActivityLeg;
};

export function isServerPriced(activity: AgentActivity): boolean {
  return activity.pricingState === "server_priced";
}

export function deploysCapital(activity: AgentActivity): boolean {
  return deploysCapitalRole(activity.eventRole);
}

export function chronological(activities: readonly AgentActivity[]): AgentActivity[] {
  return [...activities].sort((left, right) => {
    if (left.observedAtSeconds !== right.observedAtSeconds) {
      return left.observedAtSeconds - right.observedAtSeconds;
    }
    if (left.activityId === right.activityId) return 0;
    return left.activityId < right.activityId ? -1 : 1;
  });
}
