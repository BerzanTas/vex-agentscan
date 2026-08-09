import type pg from "pg";
import { rangeWindowSeconds, type ChartRangePlan } from "@agentscan/core";
import type { ChainEntry, ResolveBridgeChain } from "../app.js";
import type {
  BridgeRouteDto,
  ChartPointDto,
  NetworkDetailDto,
  NetworkStatDto,
  NetworkTokenDto,
  ProtocolStatDto,
  VerificationTier,
} from "../public-dto.js";
import { activityTimeAnchorSql } from "./activity-time-anchor.js";
import { serverPricedUsdIn, serverPricedUsdInSumOf, serverPricedUsdOut } from "./server-priced-usd.js";


const DAY_SECONDS = 86_400;
const VERIFIED_STATES = "('verified_full','verified_basic')";
const VOLUME_ROLES = "('swap','bridge_deposit')";
const OBSERVED_AT = activityTimeAnchorSql("a");
const NETWORK_CHAINS = "a.chain_family = $1 AND a.chain_id = ANY($2::bigint[])";
const VOLUME_SUM = serverPricedUsdInSumOf("a", `a.event_role IN ${VOLUME_ROLES}`);
const DEPOSIT_VOLUME_SUM = serverPricedUsdInSumOf("a", "a.event_role = 'bridge_deposit'");

type ChainFamily = "eip155" | "solana";

export type RegistryEvmChain = { chainId: bigint; entry: ChainEntry };
export type RegistrySolanaChain = { protocol: string; chainId: bigint; entry: ChainEntry };

export type RegistryNetwork = {
  canonicalSlug: string;
  displayName: string;
  verificationTier: VerificationTier;
  chainFamily: ChainFamily;
  chainIds: readonly bigint[];
};

type NetworkDraft = { entry: ChainEntry; chainFamily: ChainFamily; chainIds: bigint[] };

function collectChain(
  drafts: Map<string, NetworkDraft>,
  chainFamily: ChainFamily,
  chainId: bigint,
  entry: ChainEntry,
): void {
  const draft = drafts.get(entry.canonicalSlug);
  if (draft === undefined) {
    drafts.set(entry.canonicalSlug, { entry, chainFamily, chainIds: [chainId] });
    return;
  }
  if (draft.chainIds.includes(chainId)) return;
  draft.chainIds.push(chainId);
}

function networkOfDraft(draft: NetworkDraft): RegistryNetwork {
  return {
    canonicalSlug: draft.entry.canonicalSlug,
    displayName: draft.entry.displayName,
    verificationTier: draft.entry.verificationTier,
    chainFamily: draft.chainFamily,
    chainIds: draft.chainIds,
  };
}

export function registryNetworks(
  evmChains: readonly RegistryEvmChain[],
  solanaChains: readonly RegistrySolanaChain[],
): readonly RegistryNetwork[] {
  const drafts = new Map<string, NetworkDraft>();
  for (const chain of evmChains) collectChain(drafts, "eip155", chain.chainId, chain.entry);
  for (const chain of solanaChains) collectChain(drafts, "solana", chain.chainId, chain.entry);
  return [...drafts.values()].map(networkOfDraft);
}

export function findRegistryNetwork(
  networks: readonly RegistryNetwork[],
  chainSlug: string,
): RegistryNetwork | null {
  return networks.find((network) => network.canonicalSlug === chainSlug) ?? null;
}

type ObservationWindow = {
  windowSeconds: number | null;
  bucketSeconds: number;
  bucketCount: number | null;
};

export function observationWindowOf(plan: ChartRangePlan): ObservationWindow {
  const windowSeconds = rangeWindowSeconds(plan);
  if (plan.source === "activities") {
    return { windowSeconds, bucketSeconds: plan.bucketSeconds, bucketCount: plan.bucketCount };
  }
  return { windowSeconds, bucketSeconds: DAY_SECONDS, bucketCount: plan.days };
}

function withinWindow(windowParam: string): string {
  return `(${windowParam}::int IS NULL OR ${OBSERVED_AT} >= now() - make_interval(secs => ${windowParam}::int))`;
}

function chainIdParamsOf(network: RegistryNetwork): string[] {
  return network.chainIds.map((chainId) => chainId.toString());
}

function elapsedSecondsOf(raw: string | null): number | null {
  return raw === null ? null : Math.max(0, Number(raw));
}

type NetworkTotals = { volumeUsd: string; txCount: number; lastSeenSeconds: number | null };

const emptyNetworkTotals: NetworkTotals = { volumeUsd: "0", txCount: 0, lastSeenSeconds: null };

type NetworkTotalsRow = {
  chain_slug: string;
  volume_usd: string;
  tx_count: number;
  last_seen_seconds: string | null;
};

type ChainMap = { families: string[]; chainIds: string[]; slugs: string[] };

function chainMapOf(networks: readonly RegistryNetwork[]): ChainMap {
  const families: string[] = [];
  const chainIds: string[] = [];
  const slugs: string[] = [];
  for (const network of networks) {
    for (const chainId of network.chainIds) {
      families.push(network.chainFamily);
      chainIds.push(chainId.toString());
      slugs.push(network.canonicalSlug);
    }
  }
  return { families, chainIds, slugs };
}

async function networkTotalsBySlug(
  pool: pg.Pool,
  networks: readonly RegistryNetwork[],
  windowSeconds: number | null,
): Promise<Map<string, NetworkTotals>> {
  const chainMap = chainMapOf(networks);
  const result = await pool.query<NetworkTotalsRow>(
    `WITH chain_map(chain_family, chain_id, chain_slug) AS (
       SELECT * FROM unnest($2::text[], $3::bigint[], $4::text[])
     )
     SELECT m.chain_slug,
            ${serverPricedUsdInSumOf(
              "a",
              `a.event_role IN ${VOLUME_ROLES} AND ${withinWindow("$1")}`,
            )}::text AS volume_usd,
            COUNT(*) FILTER (WHERE ${withinWindow("$1")})::int AS tx_count,
            floor(extract(epoch FROM now() - MAX(${OBSERVED_AT})))::bigint::text AS last_seen_seconds
     FROM activities a
     JOIN chain_map m ON m.chain_family = a.chain_family AND m.chain_id = a.chain_id
     WHERE a.verification_state IN ${VERIFIED_STATES}
     GROUP BY m.chain_slug`,
    [windowSeconds, chainMap.families, chainMap.chainIds, chainMap.slugs],
  );
  return new Map(
    result.rows.map((row) => [
      row.chain_slug,
      {
        volumeUsd: row.volume_usd,
        txCount: row.tx_count,
        lastSeenSeconds: elapsedSecondsOf(row.last_seen_seconds),
      },
    ]),
  );
}

type BridgeLegGroup = {
  protocol: string;
  fromChainId: bigint | null;
  toChainId: bigint | null;
  legCount: number;
};

type BridgeLegGroupRow = {
  protocol: string;
  from_chain_id: string | null;
  to_chain_id: string | null;
  leg_count: number;
};

function bridgeLegGroupOf(row: BridgeLegGroupRow): BridgeLegGroup {
  return {
    protocol: row.protocol,
    fromChainId: row.from_chain_id === null ? null : BigInt(row.from_chain_id),
    toChainId: row.to_chain_id === null ? null : BigInt(row.to_chain_id),
    legCount: row.leg_count,
  };
}

async function bridgeLegGroups(
  pool: pg.Pool,
  windowSeconds: number | null,
): Promise<BridgeLegGroup[]> {
  const result = await pool.query<BridgeLegGroupRow>(
    `SELECT a.protocol,
            a.from_chain_id::text AS from_chain_id,
            a.to_chain_id::text AS to_chain_id,
            COUNT(*)::int AS leg_count
     FROM activities a
     WHERE a.verification_state IN ${VERIFIED_STATES}
       AND a.kind = 'bridge'
       AND ${withinWindow("$1")}
     GROUP BY a.protocol, a.from_chain_id, a.to_chain_id`,
    [windowSeconds],
  );
  return result.rows.map(bridgeLegGroupOf);
}

type BridgeCounts = { bridgeInCount: number; bridgeOutCount: number };

const noBridgeCounts: BridgeCounts = { bridgeInCount: 0, bridgeOutCount: 0 };

type BridgeDirection = "in" | "out";

function legChainSlug(
  protocol: string,
  chainId: bigint | null,
  resolveBridgeChain: ResolveBridgeChain,
): string | null {
  if (chainId === null) return null;
  return resolveBridgeChain(protocol, chainId)?.canonicalSlug ?? null;
}

function addLegCount(
  counts: Map<string, BridgeCounts>,
  chainSlug: string | null,
  direction: BridgeDirection,
  legCount: number,
): void {
  if (chainSlug === null) return;
  const current = counts.get(chainSlug) ?? noBridgeCounts;
  counts.set(chainSlug, {
    bridgeInCount: current.bridgeInCount + (direction === "in" ? legCount : 0),
    bridgeOutCount: current.bridgeOutCount + (direction === "out" ? legCount : 0),
  });
}

function bridgeCountsBySlug(
  groups: readonly BridgeLegGroup[],
  resolveBridgeChain: ResolveBridgeChain,
): Map<string, BridgeCounts> {
  const counts = new Map<string, BridgeCounts>();
  for (const group of groups) {
    addLegCount(counts, legChainSlug(group.protocol, group.fromChainId, resolveBridgeChain), "out", group.legCount);
    addLegCount(counts, legChainSlug(group.protocol, group.toChainId, resolveBridgeChain), "in", group.legCount);
  }
  return counts;
}

type ResolvedRouteMap = {
  protocols: string[];
  fromChainIds: string[];
  toChainIds: string[];
  fromChainSlugs: string[];
  toChainSlugs: string[];
};

function routeMapTouching(
  chainSlug: string,
  groups: readonly BridgeLegGroup[],
  resolveBridgeChain: ResolveBridgeChain,
): ResolvedRouteMap {
  const routeMap: ResolvedRouteMap = {
    protocols: [],
    fromChainIds: [],
    toChainIds: [],
    fromChainSlugs: [],
    toChainSlugs: [],
  };
  for (const group of groups) {
    const { protocol, fromChainId, toChainId } = group;
    if (fromChainId === null || toChainId === null) continue;
    const fromChainSlug = legChainSlug(protocol, fromChainId, resolveBridgeChain);
    const toChainSlug = legChainSlug(protocol, toChainId, resolveBridgeChain);
    if (fromChainSlug === null || toChainSlug === null) continue;
    if (fromChainSlug !== chainSlug && toChainSlug !== chainSlug) continue;
    routeMap.protocols.push(protocol);
    routeMap.fromChainIds.push(fromChainId.toString());
    routeMap.toChainIds.push(toChainId.toString());
    routeMap.fromChainSlugs.push(fromChainSlug);
    routeMap.toChainSlugs.push(toChainSlug);
  }
  return routeMap;
}

type BridgeRouteRow = {
  from_chain_slug: string;
  to_chain_slug: string;
  leg_count: number;
  volume_usd: string;
};

async function bridgeRouteTotals(
  pool: pg.Pool,
  routeMap: ResolvedRouteMap,
  windowSeconds: number | null,
  panelRows: number,
): Promise<BridgeRouteDto[]> {
  if (routeMap.protocols.length === 0) return [];
  const result = await pool.query<BridgeRouteRow>(
    `WITH route_map(protocol, from_chain_id, to_chain_id, from_chain_slug, to_chain_slug) AS (
       SELECT * FROM unnest($2::text[], $3::bigint[], $4::bigint[], $5::text[], $6::text[])
     )
     SELECT m.from_chain_slug,
            m.to_chain_slug,
            COUNT(*)::int AS leg_count,
            ${DEPOSIT_VOLUME_SUM}::text AS volume_usd
     FROM activities a
     JOIN route_map m
       ON m.protocol = a.protocol
      AND m.from_chain_id = a.from_chain_id
      AND m.to_chain_id = a.to_chain_id
     WHERE a.verification_state IN ${VERIFIED_STATES}
       AND a.kind = 'bridge'
       AND ${withinWindow("$1")}
     GROUP BY m.from_chain_slug, m.to_chain_slug
     ORDER BY ${DEPOSIT_VOLUME_SUM} DESC, COUNT(*) DESC, m.from_chain_slug, m.to_chain_slug
     LIMIT $7`,
    [
      windowSeconds,
      routeMap.protocols,
      routeMap.fromChainIds,
      routeMap.toChainIds,
      routeMap.fromChainSlugs,
      routeMap.toChainSlugs,
      panelRows,
    ],
  );
  return result.rows.map((row) => ({
    fromChainSlug: row.from_chain_slug,
    toChainSlug: row.to_chain_slug,
    legCount: row.leg_count,
    volumeUsd: row.volume_usd,
  }));
}

async function networkScalars(
  pool: pg.Pool,
  network: RegistryNetwork,
  windowSeconds: number | null,
): Promise<NetworkTotals> {
  const result = await pool.query<{ volume_usd: string; tx_count: number }>(
    `SELECT ${VOLUME_SUM}::text AS volume_usd,
            COUNT(*)::int AS tx_count
     FROM activities a
     WHERE a.verification_state IN ${VERIFIED_STATES}
       AND ${NETWORK_CHAINS}
       AND ${withinWindow("$3")}`,
    [network.chainFamily, chainIdParamsOf(network), windowSeconds],
  );
  const row = result.rows[0];
  if (row === undefined) return emptyNetworkTotals;
  return { volumeUsd: row.volume_usd, txCount: row.tx_count, lastSeenSeconds: null };
}

async function networkProtocols(
  pool: pg.Pool,
  network: RegistryNetwork,
  windowSeconds: number | null,
  panelRows: number,
): Promise<ProtocolStatDto[]> {
  const result = await pool.query<{ protocol: string; volume_usd: string; tx_count: number }>(
    `SELECT a.protocol,
            ${VOLUME_SUM}::text AS volume_usd,
            COUNT(*)::int AS tx_count
     FROM activities a
     WHERE a.verification_state IN ${VERIFIED_STATES}
       AND ${NETWORK_CHAINS}
       AND ${withinWindow("$3")}
     GROUP BY a.protocol
     ORDER BY ${VOLUME_SUM} DESC, COUNT(*) DESC, a.protocol
     LIMIT $4`,
    [network.chainFamily, chainIdParamsOf(network), windowSeconds, panelRows],
  );
  return result.rows.map((row) => ({
    protocol: row.protocol,
    volumeUsd: row.volume_usd,
    txCount: row.tx_count,
  }));
}

async function networkTokens(
  pool: pg.Pool,
  network: RegistryNetwork,
  windowSeconds: number | null,
  panelRows: number,
): Promise<NetworkTokenDto[]> {
  const result = await pool.query<{
    address: string;
    symbol: string | null;
    volume_usd: string;
    tx_count: number;
  }>(
    `WITH token_legs AS (
       SELECT lower(a.token_in_address) AS address,
              a.token_in_symbol AS symbol,
              COALESCE(${serverPricedUsdIn("a")}, 0) AS usd
       FROM activities a
       WHERE a.verification_state IN ${VERIFIED_STATES}
         AND ${NETWORK_CHAINS}
         AND ${withinWindow("$3")}
         AND a.token_in_address IS NOT NULL
       UNION ALL
       SELECT lower(a.token_out_address) AS address,
              a.token_out_symbol AS symbol,
              COALESCE(${serverPricedUsdOut("a")}, 0) AS usd
       FROM activities a
       WHERE a.verification_state IN ${VERIFIED_STATES}
         AND ${NETWORK_CHAINS}
         AND ${withinWindow("$3")}
         AND a.token_out_address IS NOT NULL
     )
     SELECT address,
            mode() WITHIN GROUP (ORDER BY symbol) AS symbol,
            SUM(usd)::text AS volume_usd,
            COUNT(*)::int AS tx_count
     FROM token_legs
     GROUP BY address
     ORDER BY SUM(usd) DESC, COUNT(*) DESC, address
     LIMIT $4`,
    [network.chainFamily, chainIdParamsOf(network), windowSeconds, panelRows],
  );
  return result.rows.map((row) => ({
    address: row.address,
    symbol: row.symbol,
    volumeUsd: row.volume_usd,
    txCount: row.tx_count,
  }));
}

async function networkSeries(
  pool: pg.Pool,
  network: RegistryNetwork,
  window: ObservationWindow,
): Promise<ChartPointDto[]> {
  const result = await pool.query<{ bucket_start: string; volume_usd: string; tx_count: number }>(
    `WITH scoped AS (
       SELECT ${OBSERVED_AT} AS observed_at, a.event_role, ${serverPricedUsdIn("a")} AS priced_usd_in
       FROM activities a
       WHERE a.verification_state IN ${VERIFIED_STATES}
         AND ${NETWORK_CHAINS}
     ),
     bounds AS (
       SELECT (floor(extract(epoch FROM now()) / $3::bigint) * $3::bigint)::bigint AS last_start,
              (SELECT (floor(extract(epoch FROM MIN(observed_at)) / $3::bigint) * $3::bigint)::bigint
               FROM scoped) AS earliest_start
     ),
     span AS (
       SELECT last_start,
              CASE WHEN $4::int IS NULL THEN COALESCE(earliest_start, last_start)
                   ELSE last_start - $3::bigint * ($4::int - 1) END AS first_start
       FROM bounds
     ),
     series AS (
       SELECT generate_series((SELECT first_start FROM span), (SELECT last_start FROM span), $3::bigint)
                AS bucket_start
     ),
     bucketed AS (
       SELECT (floor(extract(epoch FROM observed_at) / $3::bigint) * $3::bigint)::bigint AS bucket_start,
              COALESCE(SUM(priced_usd_in) FILTER (WHERE event_role IN ${VOLUME_ROLES}), 0) AS volume_usd,
              COUNT(*)::int AS tx_count
       FROM scoped
       WHERE observed_at >= to_timestamp((SELECT first_start FROM span))
       GROUP BY 1
     )
     SELECT s.bucket_start::text AS bucket_start,
            COALESCE(b.volume_usd, 0)::text AS volume_usd,
            COALESCE(b.tx_count, 0)::int AS tx_count
     FROM series s
     LEFT JOIN bucketed b ON b.bucket_start = s.bucket_start
     ORDER BY s.bucket_start`,
    [network.chainFamily, chainIdParamsOf(network), window.bucketSeconds, window.bucketCount],
  );
  return result.rows.map((row) => ({
    bucketStart: Number(row.bucket_start),
    volumeUsd: row.volume_usd,
    txCount: row.tx_count,
  }));
}

function networkStatOf(
  network: RegistryNetwork,
  totals: NetworkTotals | undefined,
  counts: BridgeCounts | undefined,
): NetworkStatDto {
  const observed = totals ?? emptyNetworkTotals;
  const bridge = counts ?? noBridgeCounts;
  return {
    chainSlug: network.canonicalSlug,
    displayName: network.displayName,
    verificationTier: network.verificationTier,
    volumeUsd: observed.volumeUsd,
    txCount: observed.txCount,
    bridgeInCount: bridge.bridgeInCount,
    bridgeOutCount: bridge.bridgeOutCount,
    lastSeenSeconds: observed.lastSeenSeconds,
  };
}

export type NetworkListOptions = {
  networks: readonly RegistryNetwork[];
  plan: ChartRangePlan;
  resolveBridgeChain: ResolveBridgeChain;
};

export async function networkList(
  pool: pg.Pool,
  options: NetworkListOptions,
): Promise<NetworkStatDto[]> {
  const { windowSeconds } = observationWindowOf(options.plan);
  const [totals, legGroups] = await Promise.all([
    networkTotalsBySlug(pool, options.networks, windowSeconds),
    bridgeLegGroups(pool, windowSeconds),
  ]);
  const counts = bridgeCountsBySlug(legGroups, options.resolveBridgeChain);
  return options.networks.map((network) =>
    networkStatOf(network, totals.get(network.canonicalSlug), counts.get(network.canonicalSlug)),
  );
}

export type NetworkDetailOptions = {
  network: RegistryNetwork;
  plan: ChartRangePlan;
  resolveBridgeChain: ResolveBridgeChain;
  panelRows: number;
};

export async function networkDetail(
  pool: pg.Pool,
  options: NetworkDetailOptions,
): Promise<NetworkDetailDto> {
  const { network, panelRows } = options;
  const window = observationWindowOf(options.plan);
  const [totals, series, protocols, tokens, legGroups] = await Promise.all([
    networkScalars(pool, network, window.windowSeconds),
    networkSeries(pool, network, window),
    networkProtocols(pool, network, window.windowSeconds, panelRows),
    networkTokens(pool, network, window.windowSeconds, panelRows),
    bridgeLegGroups(pool, window.windowSeconds),
  ]);
  const routeMap = routeMapTouching(network.canonicalSlug, legGroups, options.resolveBridgeChain);
  const routes = await bridgeRouteTotals(pool, routeMap, window.windowSeconds, panelRows);
  return {
    chainSlug: network.canonicalSlug,
    displayName: network.displayName,
    verificationTier: network.verificationTier,
    volumeUsd: totals.volumeUsd,
    txCount: totals.txCount,
    protocols,
    tokens,
    routes,
    series,
  };
}
