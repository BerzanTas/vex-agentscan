import type { AgentActivity, AgentActivityLeg, PricingState } from "../agent-metrics/agent-activity.js";

export const absentLeg: AgentActivityLeg = {
  tokenAddress: null,
  tokenDecimals: null,
  executedRaw: null,
  usdPriced: null,
};

export function leg(
  tokenAddress: string,
  tokenDecimals: number,
  executedRaw: string,
  usdPriced: string | null,
): AgentActivityLeg {
  return { tokenAddress, tokenDecimals, executedRaw, usdPriced };
}

export type ActivityShape = {
  activityId: bigint;
  observedAtSeconds: number;
  spent: AgentActivityLeg;
  received: AgentActivityLeg;
  kind?: string;
  eventRole?: string;
  protocol?: string;
  chainFamily?: "eip155" | "solana";
  chainId?: bigint;
  pricingState?: PricingState;
};

export function activity(shape: ActivityShape): AgentActivity {
  return {
    activityId: shape.activityId,
    observedAtSeconds: shape.observedAtSeconds,
    kind: shape.kind ?? "swap",
    eventRole: shape.eventRole ?? "swap",
    protocol: shape.protocol ?? "kyberswap",
    chainFamily: shape.chainFamily ?? "eip155",
    chainId: shape.chainId ?? 8453n,
    pricingState: shape.pricingState ?? "server_priced",
    spent: shape.spent,
    received: shape.received,
  };
}
