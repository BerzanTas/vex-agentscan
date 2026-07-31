export type StatsDto = {
  dailyVolumeUsd: string;
  totalVolumeUsd: string;
  dailyTx: number;
  totalTx: number;
  activeAgents7d: number;
};

export type ChartPointDto = { day: string; volumeUsd: string; txCount: number };

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

const REVALIDATE_SECONDS = 30;

const emptyStats: StatsDto = {
  dailyVolumeUsd: "0",
  totalVolumeUsd: "0",
  dailyTx: 0,
  totalTx: 0,
  activeAgents7d: 0,
};

const emptyFeed: ActivityFeedDto = { items: [], nextCursor: null };

function apiBaseUrl(): string {
  return process.env.API_BASE_URL ?? "http://localhost:3000";
}

async function readApi(path: string): Promise<Response | null> {
  try {
    return await fetch(`${apiBaseUrl()}${path}`, { next: { revalidate: REVALIDATE_SECONDS } });
  } catch {
    return null;
  }
}

async function jsonOrThrow<T>(response: Response, path: string): Promise<T> {
  if (!response.ok) throw new Error(`api ${path} responded ${response.status}`);
  return (await response.json()) as T;
}

export async function fetchStats(): Promise<StatsDto> {
  const response = await readApi("/api/stats");
  if (response === null) return emptyStats;
  return jsonOrThrow(response, "/api/stats");
}

export async function fetchChart(days: number): Promise<ChartPointDto[]> {
  const path = `/api/chart?days=${days}`;
  const response = await readApi(path);
  if (response === null) return [];
  return jsonOrThrow(response, path);
}

export async function fetchProtocols(): Promise<ProtocolStatDto[]> {
  const response = await readApi("/api/protocols");
  if (response === null) return [];
  return jsonOrThrow(response, "/api/protocols");
}

export async function fetchAgents(): Promise<AgentStatDto[]> {
  const response = await readApi("/api/agents");
  if (response === null) return [];
  return jsonOrThrow(response, "/api/agents");
}

export async function fetchActivity(cursor?: string): Promise<ActivityFeedDto> {
  const path =
    cursor === undefined ? "/api/activity" : `/api/activity?cursor=${encodeURIComponent(cursor)}`;
  const response = await readApi(path);
  if (response === null) return emptyFeed;
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
  if (response === null) return null;
  if (response.status === 404) return null;
  return jsonOrThrow(response, path);
}
