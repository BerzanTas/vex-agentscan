import type { ChainFamily } from "../chain-registry/catalog.js";
import { isServerPriced, type AgentActivity } from "./agent-activity.js";
import { ZERO_DECIMAL, addDecimal, decimalFromText, decimalToText, type Decimal } from "./decimal.js";

export type ProtocolVolume = { protocol: string; volumeUsd: string; txCount: number };

export type ChainVolume = {
  chainFamily: ChainFamily;
  chainId: bigint;
  protocols: string[];
  volumeUsd: string;
  txCount: number;
};

type VolumeTally = { volume: Decimal; txCount: number };

type ChainVolumeTally = VolumeTally & {
  chainFamily: ChainFamily;
  chainId: bigint;
  protocols: Set<string>;
};

const emptyTally: VolumeTally = { volume: ZERO_DECIMAL, txCount: 0 };

function pricedVolumeOf(activity: AgentActivity): Decimal {
  if (!isServerPriced(activity) || activity.spent.usdPriced === null) return ZERO_DECIMAL;
  return decimalFromText(activity.spent.usdPriced);
}

function tallied(tally: VolumeTally, activity: AgentActivity): VolumeTally {
  return {
    volume: addDecimal(tally.volume, pricedVolumeOf(activity)),
    txCount: tally.txCount + 1,
  };
}

function heavierVolumeFirst(left: Decimal, right: Decimal): number {
  if (left === right) return 0;
  return right > left ? 1 : -1;
}

export function protocolBreakdown(activities: readonly AgentActivity[]): ProtocolVolume[] {
  const tallies = new Map<string, VolumeTally>();
  for (const activity of activities) {
    tallies.set(activity.protocol, tallied(tallies.get(activity.protocol) ?? emptyTally, activity));
  }
  return [...tallies.entries()]
    .sort(([leftProtocol, left], [rightProtocol, right]) =>
      heavierVolumeFirst(left.volume, right.volume) || leftProtocol.localeCompare(rightProtocol),
    )
    .map(([protocol, tally]) => ({
      protocol,
      volumeUsd: decimalToText(tally.volume),
      txCount: tally.txCount,
    }));
}

function chainKeyOf(activity: AgentActivity): string {
  return `${activity.chainFamily}:${activity.chainId}`;
}

function chainTallyOf(existing: ChainVolumeTally | undefined, activity: AgentActivity): ChainVolumeTally {
  const base = existing ?? {
    ...emptyTally,
    chainFamily: activity.chainFamily,
    chainId: activity.chainId,
    protocols: new Set<string>(),
  };
  base.protocols.add(activity.protocol);
  return { ...base, ...tallied(base, activity) };
}

function chainIdentityOrder(left: ChainVolumeTally, right: ChainVolumeTally): number {
  if (left.chainFamily !== right.chainFamily) return left.chainFamily.localeCompare(right.chainFamily);
  if (left.chainId === right.chainId) return 0;
  return left.chainId < right.chainId ? -1 : 1;
}

export function chainBreakdown(activities: readonly AgentActivity[]): ChainVolume[] {
  const tallies = new Map<string, ChainVolumeTally>();
  for (const activity of activities) {
    const key = chainKeyOf(activity);
    tallies.set(key, chainTallyOf(tallies.get(key), activity));
  }
  return [...tallies.values()]
    .sort((left, right) => heavierVolumeFirst(left.volume, right.volume) || chainIdentityOrder(left, right))
    .map((tally) => ({
      chainFamily: tally.chainFamily,
      chainId: tally.chainId,
      protocols: [...tally.protocols].sort((left, right) => left.localeCompare(right)),
      volumeUsd: decimalToText(tally.volume),
      txCount: tally.txCount,
    }));
}
