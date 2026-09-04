export type StatsDto = {
  dailyVolumeUsd: string;
  totalVolumeUsd: string;
  dailyTx: number;
  totalTx: number;
  activeAgents7d: number;
  totalAgents: number;
};

export type ChartPointDto = { bucketStart: number; volumeUsd: string; txCount: number };

export type ChartRange = "24h" | "7d" | "30d" | "all";

export const DEFAULT_CHART_RANGE: ChartRange = "30d";

export type ProtocolStatDto = { protocol: string; volumeUsd: string; txCount: number };

export type AgentStatDto = {
  alias: string;
  name: string | null;
  volumeUsd: string;
  txCount: number;
  protocolCount: number;
  chainCount: number;
  lastSeenSeconds: number;
};

export type AgentLeaderboardDto = {
  items: AgentStatDto[];
  nextCursor: string | null;
  totalAllTime: number;
  totalInWindow: number;
};

export type AgentDailyDeployedDto = { day: string; usd: string };

export type AgentChainStatDto = { chainSlug: string | null; volumeUsd: string; txCount: number };

export type AgentPageDto = {
  name: string;
  capitalDeployedPeak30dUsd: string;
  dailyDeployedUsd: AgentDailyDeployedDto[];
  realizedResultUsd: string;
  closedRoundTrips: number;
  unmatchedDisposals: number;
  winRate: number | null;
  protocolBreakdown: ProtocolStatDto[];
  chainBreakdown: AgentChainStatDto[];
  activityCount: number;
  activitiesPerDay30d: number;
  firstSeenSeconds: number;
  lastSeenSeconds: number;
  unpricedSharePct: number;
  unpriced30dSharePct: number;
  awaitingAPriceCount: number;
  truncated: boolean;
};

export type ProtocolRankingDto = ProtocolStatDto & {
  chainCount: number;
  swapTxCount: number;
  bridgeTxCount: number;
};

export type VerificationTier = "full" | "basic";

export type TokenStatDto = {
  chainSlug: string;
  address: string;
  symbol: string | null;
  volumeUsd: string;
  txCount: number;
  agentCount: number;
  protocols: string[];
  lastSeenSeconds: number;
  series: ChartPointDto[];
};

export type TokenListingDto = {
  items: TokenStatDto[];
  nextCursor: string | null;
};

export type TokenPairStatDto = {
  tokenInSymbol: string | null;
  tokenOutSymbol: string | null;
  txCount: number;
};

export type TokenDetailDto = {
  chainSlug: string;
  address: string;
  symbol: string | null;
  decimals: number | null;
  volumeUsd: string;
  txCount: number;
  agentCount: number;
  protocols: ProtocolStatDto[];
  pairs: TokenPairStatDto[];
  series: ChartPointDto[];
};

export type NetworkStatDto = {
  chainSlug: string;
  displayName: string;
  verificationTier: VerificationTier;
  volumeUsd: string;
  txCount: number;
  bridgeInCount: number;
  bridgeOutCount: number;
  lastSeenSeconds: number | null;
};

export type NetworkTokenStatDto = {
  address: string;
  symbol: string | null;
  volumeUsd: string;
  txCount: number;
};

export type BridgeRouteDto = {
  fromChainSlug: string;
  toChainSlug: string;
  legCount: number;
  volumeUsd: string;
};

export type NetworkDetailDto = {
  chainSlug: string;
  displayName: string;
  verificationTier: VerificationTier;
  volumeUsd: string;
  txCount: number;
  protocols: ProtocolStatDto[];
  tokens: NetworkTokenStatDto[];
  routes: BridgeRouteDto[];
  series: ChartPointDto[];
};

export type ChainTierDto = {
  chainSlug: string;
  displayName: string;
  verificationTier: VerificationTier;
};

export type VerificationStatsDto = {
  verifiedFull: number;
  verifiedBasic: number;
  queued: number;
  latencySeconds: { median: number | null; p90: number | null };
  chains: ChainTierDto[];
};

/**
 * The Vex integrator fee charged for an action. It settles as a transaction of its own - hence the
 * separate hash, status and explorer link - but the site shows it folded under the action it paid
 * for, never as a second entry. Kept in lockstep with `apps/server/src/public-dto.ts`.
 */
export type VexFeeDto = {
  amountRaw: string | null;
  decimals: number | null;
  symbol: string | null;
  txHash: string | null;
  status: string;
  usdEst: string | null;
  explorerUrl: string | null;
};

export type ActivityRowDto = {
  publicId: string;
  kind: string;
  eventRole: string;
  protocol: string;
  status: string;
  verificationState: string;
  chainSlug: string | null;
  fromChainSlug: string | null;
  toChainSlug: string | null;
  explorerUrl: string | null;
  tokenInSymbol: string | null;
  tokenOutSymbol: string | null;
  amountInRaw: string | null;
  tokenInDecimals: number | null;
  usdInEst: string | null;
  txHash: string | null;
  ageSeconds: number;
  vexFee: VexFeeDto | null;
};

export type ActivityFeedDto = { items: ActivityRowDto[]; nextCursor: string | null };

export type TxDetailDto = ActivityRowDto & {
  executedInRaw: string | null;
  executedOutRaw: string | null;
  tokenOutDecimals: number | null;
  usdOutEst: string | null;
  usdFeeEst: string | null;
  usdSource: string | null;
  clientCreatedAt: string;
  clientConfirmedAt: string | null;
  failureCode: string | null;
};

export const ACTIVITY_KIND_FILTERS = [
  "swap",
  "bridge",
  "lend",
  "prediction",
  "wrap",
  "yield",
  "launch",
  "claim",
  "transfer",
] as const;

export const ACTIVITY_STATUS_FILTERS = [
  "pending",
  "confirmed",
  "definitively_failed",
  "superseded_unproven",
] as const;

export const ACTIVITY_VERIFICATION_FILTERS = ["verified_full", "verified_basic", "pending"] as const;

export type ActivityKindFilter = (typeof ACTIVITY_KIND_FILTERS)[number];

export type ActivityStatusFilter = (typeof ACTIVITY_STATUS_FILTERS)[number];

export type ActivityVerificationFilter = (typeof ACTIVITY_VERIFICATION_FILTERS)[number];

export type ActivityFilters = {
  kind?: ActivityKindFilter;
  protocol?: string;
  chain?: string;
  status?: ActivityStatusFilter;
  verification?: ActivityVerificationFilter;
};

const REVALIDATE_SECONDS = 5;

function apiBaseUrl(): string {
  return process.env.API_BASE_URL ?? "http://localhost:3000";
}

async function readApi(path: string): Promise<Response> {
  return fetch(`${apiBaseUrl()}${path}`, { next: { revalidate: REVALIDATE_SECONDS } });
}

async function jsonOrThrow<T>(response: Response, path: string): Promise<T> {
  if (!response.ok) throw new Error(`api ${path} responded ${response.status}`);
  return (await response.json()) as T;
}

async function readApiJson<T>(path: string): Promise<T> {
  return jsonOrThrow<T>(await readApi(path), path);
}

async function readApiJsonOrNull<T>(path: string): Promise<T | null> {
  const response = await readApi(path);
  if (response.status === 404) return null;
  return jsonOrThrow<T>(response, path);
}

async function readBrowserJson<T>(path: string): Promise<T> {
  return jsonOrThrow<T>(await fetch(path, { cache: "no-store" }), path);
}

type QueryParam = readonly [name: string, value: string | number | undefined];

function pathWithQuery(path: string, params: readonly QueryParam[]): string {
  const query = params
    .filter((param): param is readonly [string, string | number] => param[1] !== undefined)
    .map(([name, value]) => `${name}=${encodeURIComponent(String(value))}`)
    .join("&");
  if (query === "") return path;
  return `${path}?${query}`;
}

export async function fetchStats(): Promise<StatsDto> {
  const response = await readApi("/api/stats");
  return jsonOrThrow(response, "/api/stats");
}

export function chartPath(range: ChartRange): string {
  return `/api/chart?range=${range}`;
}

export async function fetchChart(range: ChartRange): Promise<ChartPointDto[]> {
  const path = chartPath(range);
  const response = await readApi(path);
  return jsonOrThrow(response, path);
}

export async function fetchChartFromBrowser(range: ChartRange): Promise<ChartPointDto[]> {
  const path = chartPath(range);
  const response = await fetch(path, { cache: "no-store" });
  return jsonOrThrow(response, path);
}

export function tokensPath(
  range: ChartRange,
  options: { limit?: number; cursor?: string } = {},
): string {
  return pathWithQuery("/api/tokens", [
    ["range", range],
    ["limit", options.limit],
    ["cursor", options.cursor],
  ]);
}

export function tokenDetailPath(chainSlug: string, address: string, range: ChartRange): string {
  const path = `/api/tokens/${encodeURIComponent(chainSlug)}/${encodeURIComponent(address)}`;
  return pathWithQuery(path, [["range", range]]);
}

export function networksPath(range: ChartRange): string {
  return pathWithQuery("/api/networks", [["range", range]]);
}

export function networkDetailPath(slug: string, range: ChartRange): string {
  return pathWithQuery(`/api/networks/${encodeURIComponent(slug)}`, [["range", range]]);
}

export function routesPath(range: ChartRange): string {
  return pathWithQuery("/api/routes", [["range", range]]);
}

export function verificationPath(): string {
  return "/api/verification";
}

export function protocolsPath(): string {
  return "/api/protocols";
}

export function protocolRankingPath(range: ChartRange): string {
  return pathWithQuery("/api/protocols/ranking", [["range", range]]);
}

export function agentsPath(
  range: ChartRange,
  options: { limit?: number; cursor?: string } = {},
): string {
  return pathWithQuery("/api/agents", [
    ["range", range],
    ["limit", options.limit],
    ["cursor", options.cursor],
  ]);
}

export function agentPagePath(name: string): string {
  return `/api/agents/${encodeURIComponent(name)}`;
}

export function activityPath(filters: ActivityFilters = {}, cursor?: string): string {
  return pathWithQuery("/api/activity", [
    ["cursor", cursor],
    ["kind", filters.kind],
    ["protocol", filters.protocol],
    ["chain", filters.chain],
    ["status", filters.status],
    ["verification", filters.verification],
  ]);
}

export async function fetchTokens(
  range: ChartRange = DEFAULT_CHART_RANGE,
  options: { limit?: number; cursor?: string } = {},
): Promise<TokenListingDto> {
  return readApiJson(tokensPath(range, options));
}

export async function fetchTokenDetail(
  chainSlug: string,
  address: string,
  range: ChartRange = DEFAULT_CHART_RANGE,
): Promise<TokenDetailDto | null> {
  return readApiJsonOrNull(tokenDetailPath(chainSlug, address, range));
}

export async function fetchNetworks(
  range: ChartRange = DEFAULT_CHART_RANGE,
): Promise<NetworkStatDto[]> {
  return readApiJson(networksPath(range));
}

export async function fetchNetworkDetail(
  slug: string,
  range: ChartRange = DEFAULT_CHART_RANGE,
): Promise<NetworkDetailDto | null> {
  return readApiJsonOrNull(networkDetailPath(slug, range));
}

export async function fetchBridgeRoutes(
  range: ChartRange = DEFAULT_CHART_RANGE,
): Promise<BridgeRouteDto[]> {
  return readApiJson(routesPath(range));
}

export async function fetchVerificationStats(): Promise<VerificationStatsDto> {
  return readApiJson(verificationPath());
}

export async function fetchProtocols(): Promise<ProtocolStatDto[]> {
  return readApiJson(protocolsPath());
}

export async function fetchProtocolRanking(
  range: ChartRange = DEFAULT_CHART_RANGE,
): Promise<ProtocolRankingDto[]> {
  return readApiJson(protocolRankingPath(range));
}

export async function fetchAgents(
  range: ChartRange = DEFAULT_CHART_RANGE,
  options: { limit?: number; cursor?: string } = {},
): Promise<AgentLeaderboardDto> {
  return readApiJson(agentsPath(range, options));
}

export async function fetchAgentPage(name: string): Promise<AgentPageDto | null> {
  return readApiJsonOrNull(agentPagePath(name));
}

export async function fetchActivity(
  filters: ActivityFilters = {},
  cursor?: string,
): Promise<ActivityFeedDto> {
  return readApiJson(activityPath(filters, cursor));
}

export async function fetchTokensFromBrowser(
  range: ChartRange,
  options: { limit?: number; cursor?: string } = {},
): Promise<TokenListingDto> {
  return readBrowserJson(tokensPath(range, options));
}

export async function fetchNetworksFromBrowser(range: ChartRange): Promise<NetworkStatDto[]> {
  return readBrowserJson(networksPath(range));
}

export async function fetchProtocolRankingFromBrowser(
  range: ChartRange,
): Promise<ProtocolRankingDto[]> {
  return readBrowserJson(protocolRankingPath(range));
}

export async function fetchAgentsFromBrowser(
  range: ChartRange,
  options: { limit?: number; cursor?: string } = {},
): Promise<AgentLeaderboardDto> {
  return readBrowserJson(agentsPath(range, options));
}

export async function fetchActivityFromBrowser(
  cursor: string,
  filters: ActivityFilters = {},
): Promise<ActivityFeedDto> {
  return readBrowserJson(activityPath(filters, cursor));
}

export async function fetchLookup(q: string): Promise<{ publicId: string } | null> {
  const base = typeof window === "undefined" ? apiBaseUrl() : "";
  try {
    const response = await fetch(`${base}/api/lookup?q=${encodeURIComponent(q)}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as { publicId: string };
  } catch {
    return null;
  }
}

export async function fetchTxDetail(publicId: string): Promise<TxDetailDto | null> {
  const path = `/api/tx/${encodeURIComponent(publicId)}`;
  const response = await readApi(path);
  if (response.status === 404) return null;
  return jsonOrThrow(response, path);
}
