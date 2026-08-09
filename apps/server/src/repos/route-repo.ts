import type pg from "pg";
import { rangeWindowSeconds, type ChartRangePlan } from "@agentscan/core";
import type { ResolveBridgeChain } from "../app.js";
import { serverPricedUsdInSumOf } from "./server-priced-usd.js";


export type BridgeRouteRead = {
  fromChainSlug: string;
  toChainSlug: string;
  legCount: number;
  volumeUsd: string;
};

type BridgeLegGroupRow = {
  protocol: string;
  from_chain_id: string;
  to_chain_id: string;
  leg_count: number;
  volume_usd: string;
};

type BridgeLegGroup = {
  protocol: string;
  fromChainId: bigint;
  toChainId: bigint;
  legCount: number;
  volumeUsd: string;
};

function fractionScaleOf(amount: string): number {
  const separatorIndex = amount.indexOf(".");
  return separatorIndex === -1 ? 0 : amount.length - separatorIndex - 1;
}

function unitsAtScale(amount: string, scale: number): bigint {
  const separatorIndex = amount.indexOf(".");
  if (separatorIndex === -1) return BigInt(amount + "0".repeat(scale));
  const whole = amount.slice(0, separatorIndex);
  const fraction = amount.slice(separatorIndex + 1);
  return BigInt(whole + fraction.padEnd(scale, "0"));
}

function amountFromUnits(units: bigint, scale: number): string {
  if (scale === 0) return units.toString();
  const digits = units.toString().padStart(scale + 1, "0");
  return `${digits.slice(0, digits.length - scale)}.${digits.slice(digits.length - scale)}`;
}

function widestScaleOf(amounts: readonly string[]): number {
  return amounts.reduce((widest, amount) => Math.max(widest, fractionScaleOf(amount)), 0);
}

function sumUsdAmounts(amounts: readonly string[]): string {
  const scale = widestScaleOf(amounts);
  const total = amounts.reduce((sum, amount) => sum + unitsAtScale(amount, scale), 0n);
  return amountFromUnits(total, scale);
}

function compareUsdAmounts(left: string, right: string): number {
  const scale = widestScaleOf([left, right]);
  const leftUnits = unitsAtScale(left, scale);
  const rightUnits = unitsAtScale(right, scale);
  if (leftUnits === rightUnits) return 0;
  return leftUnits > rightUnits ? 1 : -1;
}

async function bridgeLegGroups(pool: pg.Pool, plan: ChartRangePlan): Promise<BridgeLegGroup[]> {
  const result = await pool.query<BridgeLegGroupRow>(
    `SELECT a.protocol,
            a.from_chain_id::text AS from_chain_id,
            a.to_chain_id::text AS to_chain_id,
            COUNT(*)::int AS leg_count,
            ${serverPricedUsdInSumOf("a", "a.event_role = 'bridge_deposit'")}::text AS volume_usd
     FROM activities a
     WHERE a.kind = 'bridge'
       AND a.verification_state IN ('verified_full','verified_basic')
       AND a.from_chain_id IS NOT NULL
       AND a.to_chain_id IS NOT NULL
       AND ($1::int IS NULL
            OR COALESCE(a.client_confirmed_at, a.verified_at) >= now() - make_interval(secs => $1::int))
     GROUP BY a.protocol, a.from_chain_id, a.to_chain_id`,
    [rangeWindowSeconds(plan)],
  );
  return result.rows.map((row) => ({
    protocol: row.protocol,
    fromChainId: BigInt(row.from_chain_id),
    toChainId: BigInt(row.to_chain_id),
    legCount: row.leg_count,
    volumeUsd: row.volume_usd,
  }));
}

type RouteTally = {
  fromChainSlug: string;
  toChainSlug: string;
  legCount: number;
  volumes: string[];
};

function tallyRoutesBySlugPair(
  groups: readonly BridgeLegGroup[],
  resolveBridgeChain: ResolveBridgeChain,
): RouteTally[] {
  const bySlugPair = new Map<string, RouteTally>();
  for (const group of groups) {
    const fromChain = resolveBridgeChain(group.protocol, group.fromChainId);
    const toChain = resolveBridgeChain(group.protocol, group.toChainId);
    if (fromChain === null || toChain === null) continue;
    const slugPair = `${fromChain.canonicalSlug}>${toChain.canonicalSlug}`;
    const tallied = bySlugPair.get(slugPair);
    if (tallied === undefined) {
      bySlugPair.set(slugPair, {
        fromChainSlug: fromChain.canonicalSlug,
        toChainSlug: toChain.canonicalSlug,
        legCount: group.legCount,
        volumes: [group.volumeUsd],
      });
      continue;
    }
    tallied.legCount += group.legCount;
    tallied.volumes.push(group.volumeUsd);
  }
  return [...bySlugPair.values()];
}

function byVolumeThenLegCountDescending(left: BridgeRouteRead, right: BridgeRouteRead): number {
  const byVolume = compareUsdAmounts(right.volumeUsd, left.volumeUsd);
  if (byVolume !== 0) return byVolume;
  const byLegCount = right.legCount - left.legCount;
  if (byLegCount !== 0) return byLegCount;
  return `${left.fromChainSlug}>${left.toChainSlug}`.localeCompare(
    `${right.fromChainSlug}>${right.toChainSlug}`,
  );
}

export async function bridgeRoutes(
  pool: pg.Pool,
  plan: ChartRangePlan,
  resolveBridgeChain: ResolveBridgeChain,
): Promise<BridgeRouteRead[]> {
  const groups = await bridgeLegGroups(pool, plan);
  return tallyRoutesBySlugPair(groups, resolveBridgeChain)
    .map(({ fromChainSlug, toChainSlug, legCount, volumes }) => ({
      fromChainSlug,
      toChainSlug,
      legCount,
      volumeUsd: sumUsdAmounts(volumes),
    }))
    .sort(byVolumeThenLegCountDescending);
}
