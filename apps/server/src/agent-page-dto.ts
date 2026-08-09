import {
  activitiesPerDay30d,
  awaitingAPriceCount,
  capitalDeployed,
  chainBreakdown,
  protocolBreakdown,
  publishedUsd,
  realizedResult,
  unpriced30dSharePct,
  unpricedSharePct,
  winRate,
  type AgentActivity,
  type ChainVolume,
} from "@agentscan/core";
import type { ResolveChain } from "./app.js";

const SEEN_RESOLUTION_SECONDS = 3600;

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
  unpriced30dSharePct: number;
  awaitingAPriceCount: number;
  truncated: boolean;
};

export type AgentPageInput = {
  name: string;
  activities: readonly AgentActivity[];
  firstObservedAtSeconds: number;
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

function seenAgeSecondsOf(observedAtSeconds: number, nowSeconds: number): number {
  const age = Math.max(0, Math.floor(nowSeconds - observedAtSeconds));
  return Math.floor(age / SEEN_RESOLUTION_SECONDS) * SEEN_RESOLUTION_SECONDS;
}

function latestObservedAtSecondsOf(activities: readonly AgentActivity[], fallback: number): number {
  return activities.reduce(
    (latest, activity) => Math.max(latest, activity.observedAtSeconds),
    fallback,
  );
}

export function toAgentPageDto(input: AgentPageInput, resolveChain: ResolveChain): AgentPageDto {
  const deployed = capitalDeployed(input.activities, input.nowSeconds);
  const realized = realizedResult(input.activities);
  return {
    name: input.name,
    capitalDeployedPeak30dUsd: publishedUsd(deployed.peakUsd),
    dailyDeployedUsd: deployed.daily.map((point) => ({
      day: point.day,
      usd: publishedUsd(point.usd),
    })),
    realizedResultUsd: publishedUsd(realized.realizedUsd),
    closedRoundTrips: realized.closedRoundTrips,
    unmatchedDisposals: realized.unmatchedDisposals,
    winRate: winRate(realized, input.minimumRoundTrips),
    protocolBreakdown: protocolBreakdown(input.activities).map((entry) => ({
      protocol: entry.protocol,
      volumeUsd: publishedUsd(entry.volumeUsd),
      txCount: entry.txCount,
    })),
    chainBreakdown: chainBreakdown(input.activities).map((chain) => ({
      chainSlug: chainSlugOf(chain, resolveChain),
      volumeUsd: publishedUsd(chain.volumeUsd),
      txCount: chain.txCount,
    })),
    activityCount: input.activities.length,
    activitiesPerDay30d: activitiesPerDay30d(input.activities, input.nowSeconds),
    firstSeenSeconds: seenAgeSecondsOf(input.firstObservedAtSeconds, input.nowSeconds),
    lastSeenSeconds: seenAgeSecondsOf(
      latestObservedAtSecondsOf(input.activities, input.firstObservedAtSeconds),
      input.nowSeconds,
    ),
    unpricedSharePct: unpricedSharePct(input.activities),
    unpriced30dSharePct: unpriced30dSharePct(input.activities, input.nowSeconds),
    awaitingAPriceCount: awaitingAPriceCount(input.activities),
    truncated: input.truncated,
  };
}
