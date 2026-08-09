import {
  activitiesPerDay30d,
  capitalDeployed,
  chainBreakdown,
  protocolBreakdown,
  realizedResult,
  unpricedSharePct,
  winRate,
  type AgentActivity,
  type ChainVolume,
} from "@agentscan/core";
import type { ResolveChain } from "./app.js";

export type DailyDeployedDto = { day: string; usd: string };

export type AgentProtocolDto = { protocol: string; volumeUsd: string; txCount: number };

export type AgentChainDto = { chainSlug: string | null; volumeUsd: string; txCount: number };

export type AgentPageDto = {
  name: string;
  capitalDeployedPeak30dUsd: string;
  dailyDeployedUsd: DailyDeployedDto[];
  realizedResultUsd: string;
  closedRoundTrips: number;
  unmatchedDisposals: number;
  winRate: number | null;
  protocolBreakdown: AgentProtocolDto[];
  chainBreakdown: AgentChainDto[];
  activityCount: number;
  activitiesPerDay30d: number;
  firstSeenSeconds: number;
  lastSeenSeconds: number;
  unpricedSharePct: number;
  truncated: boolean;
};

export type AgentPageInput = {
  name: string;
  activities: readonly AgentActivity[];
  truncated: boolean;
  minimumRoundTrips: number;
  nowSeconds: number;
};

function chainSlugOf(chain: ChainVolume, resolveChain: ResolveChain): string | null {
  for (const protocol of chain.protocols) {
    const entry = resolveChain({
      protocol,
      chainFamily: chain.chainFamily,
      chainId: chain.chainId,
    });
    if (entry !== null) return entry.canonicalSlug;
  }
  return null;
}

function ageSecondsOf(observedAtSeconds: number, nowSeconds: number): number {
  return Math.max(0, Math.floor(nowSeconds - observedAtSeconds));
}

type SeenSpan = { firstSeenSeconds: number; lastSeenSeconds: number };

function seenSpanOf(activities: readonly AgentActivity[], nowSeconds: number): SeenSpan {
  const observed = activities.map((activity) => activity.observedAtSeconds);
  if (observed.length === 0) return { firstSeenSeconds: 0, lastSeenSeconds: 0 };
  return {
    firstSeenSeconds: ageSecondsOf(Math.min(...observed), nowSeconds),
    lastSeenSeconds: ageSecondsOf(Math.max(...observed), nowSeconds),
  };
}

export function toAgentPageDto(input: AgentPageInput, resolveChain: ResolveChain): AgentPageDto {
  const deployed = capitalDeployed(input.activities, input.nowSeconds);
  const realized = realizedResult(input.activities);
  return {
    name: input.name,
    capitalDeployedPeak30dUsd: deployed.peakUsd,
    dailyDeployedUsd: deployed.daily,
    realizedResultUsd: realized.realizedUsd,
    closedRoundTrips: realized.closedRoundTrips,
    unmatchedDisposals: realized.unmatchedDisposals,
    winRate: winRate(realized, input.minimumRoundTrips),
    protocolBreakdown: protocolBreakdown(input.activities),
    chainBreakdown: chainBreakdown(input.activities).map((chain) => ({
      chainSlug: chainSlugOf(chain, resolveChain),
      volumeUsd: chain.volumeUsd,
      txCount: chain.txCount,
    })),
    activityCount: input.activities.length,
    activitiesPerDay30d: activitiesPerDay30d(input.activities, input.nowSeconds),
    ...seenSpanOf(input.activities, input.nowSeconds),
    unpricedSharePct: unpricedSharePct(input.activities),
    truncated: input.truncated,
  };
}
