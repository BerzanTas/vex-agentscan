export type StatsDto = {
  dailyVolumeUsd: string;
  totalVolumeUsd: string;
  dailyTx: number;
  totalTx: number;
  activeAgents7d: number;
};

export type ChartPointDto = { bucketStart: number; volumeUsd: string; txCount: number };

export type ChartRange = "24h" | "7d" | "30d" | "all";

export const DEFAULT_CHART_RANGE: ChartRange = "30d";

export type ProtocolStatDto = { protocol: string; volumeUsd: string; txCount: number };

export type AgentStatDto = { alias: string; volumeUsd: string; txCount: number };

export type ActivityRowDto = {
  publicId: string;
  kind: string;
  eventRole: string;
  protocol: string;
  status: string;
  verificationState: string;
  chainSlug: string | null;
  explorerUrl: string | null;
  tokenInSymbol: string | null;
  tokenOutSymbol: string | null;
  amountInRaw: string | null;
  tokenInDecimals: number | null;
  usdInEst: string | null;
  txHash: string | null;
  ageSeconds: number;
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

export async function fetchProtocols(): Promise<ProtocolStatDto[]> {
  const response = await readApi("/api/protocols");
  return jsonOrThrow(response, "/api/protocols");
}

export async function fetchAgents(): Promise<AgentStatDto[]> {
  const response = await readApi("/api/agents");
  return jsonOrThrow(response, "/api/agents");
}

export function activityPath(cursor?: string): string {
  if (cursor === undefined) return "/api/activity";
  return `/api/activity?cursor=${encodeURIComponent(cursor)}`;
}

export async function fetchActivity(cursor?: string): Promise<ActivityFeedDto> {
  const path = activityPath(cursor);
  const response = await readApi(path);
  return jsonOrThrow(response, path);
}

export async function fetchActivityFromBrowser(cursor: string): Promise<ActivityFeedDto> {
  const path = activityPath(cursor);
  const response = await fetch(path, { cache: "no-store" });
  return jsonOrThrow(response, path);
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
