import { createHash } from "node:crypto";
import type { ChainEntry, ResolveChain } from "./app.js";
import type { ActivityDbRow, AgentVolumeRead, PricingCoverageRead } from "./repos/read-repo.js";

export type ResolveBridgeChain = (protocol: string, chainId: bigint) => ChainEntry | null;

export type VerificationTier = ChainEntry["verificationTier"];

export type StatsDto = {
  dailyVolumeUsd: string;
  totalVolumeUsd: string;
  dailyTx: number;
  totalTx: number;
  activeAgents7d: number;
};

export type ChartPointDto = { bucketStart: number; volumeUsd: string; txCount: number };

export type LookupDto = { publicId: string };

export type ProtocolStatDto = { protocol: string; volumeUsd: string; txCount: number };

export type ProtocolRankingDto = ProtocolStatDto & {
  chainCount: number;
  swapTxCount: number;
  bridgeTxCount: number;
};

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

export function agentAlias(salt: string, agentHash: string): string {
  const digest = createHash("sha256").update(salt + agentHash).digest("hex");
  return `agent-${digest.slice(0, 8)}`;
}

export function toAgentStatDto(
  salt: string,
  read: AgentVolumeRead,
  name: string | null,
): AgentStatDto {
  return {
    alias: agentAlias(salt, read.agentHash),
    name,
    volumeUsd: read.volumeUsd,
    txCount: read.txCount,
    protocolCount: read.protocolCount,
    chainCount: read.chainCount,
    lastSeenSeconds: read.lastSeenSeconds,
  };
}

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

type ChainPresentation = { chainSlug: string | null; explorerUrl: string | null };

function chainPresentationFor(row: ActivityDbRow, resolveChain: ResolveChain): ChainPresentation {
  const chainFamily = row.chain_family === "solana" ? "solana" : "eip155";
  const entry = resolveChain({ protocol: row.protocol, chainFamily, chainId: row.chain_id });
  if (entry === null) return { chainSlug: null, explorerUrl: null };
  return {
    chainSlug: entry.canonicalSlug,
    explorerUrl: row.tx_hash === null ? null : entry.explorerTxUrl(row.tx_hash),
  };
}

type BridgeRoutePresentation = { fromChainSlug: string | null; toChainSlug: string | null };

const noBridgeRoute: BridgeRoutePresentation = { fromChainSlug: null, toChainSlug: null };

const bridgeChainUnresolved: ResolveBridgeChain = () => null;

function bridgeLegSlug(
  protocol: string,
  chainId: bigint | null,
  resolveBridgeChain: ResolveBridgeChain,
): string | null {
  if (chainId === null) return null;
  return resolveBridgeChain(protocol, chainId)?.canonicalSlug ?? null;
}

function bridgeRouteFor(row: ActivityDbRow, resolveBridgeChain: ResolveBridgeChain): BridgeRoutePresentation {
  if (row.kind !== "bridge") return noBridgeRoute;
  return {
    fromChainSlug: bridgeLegSlug(row.protocol, row.from_chain_id, resolveBridgeChain),
    toChainSlug: bridgeLegSlug(row.protocol, row.to_chain_id, resolveBridgeChain),
  };
}

function ageSecondsOf(row: ActivityDbRow): number {
  return Math.max(0, Math.floor((Date.now() - row.event_time.getTime()) / 1000));
}

export function toActivityRowDto(
  row: ActivityDbRow,
  resolveChain: ResolveChain,
  resolveBridgeChain: ResolveBridgeChain = bridgeChainUnresolved,
): ActivityRowDto {
  const chain = chainPresentationFor(row, resolveChain);
  const route = bridgeRouteFor(row, resolveBridgeChain);
  return {
    publicId: row.public_id,
    kind: row.kind,
    eventRole: row.event_role,
    protocol: row.protocol,
    status: row.status,
    verificationState: row.verification_state,
    chainSlug: chain.chainSlug,
    fromChainSlug: route.fromChainSlug,
    toChainSlug: route.toChainSlug,
    explorerUrl: chain.explorerUrl,
    tokenInSymbol: row.token_in_symbol,
    tokenOutSymbol: row.token_out_symbol,
    amountInRaw: row.amount_in_raw,
    tokenInDecimals: row.token_in_decimals,
    usdInEst: row.usd_in_est,
    txHash: row.tx_hash,
    ageSeconds: ageSecondsOf(row),
  };
}

export function toTxDetailDto(
  row: ActivityDbRow,
  resolveChain: ResolveChain,
  resolveBridgeChain: ResolveBridgeChain = bridgeChainUnresolved,
): TxDetailDto {
  const chain = chainPresentationFor(row, resolveChain);
  const route = bridgeRouteFor(row, resolveBridgeChain);
  return {
    publicId: row.public_id,
    kind: row.kind,
    eventRole: row.event_role,
    protocol: row.protocol,
    status: row.status,
    verificationState: row.verification_state,
    chainSlug: chain.chainSlug,
    fromChainSlug: route.fromChainSlug,
    toChainSlug: route.toChainSlug,
    explorerUrl: chain.explorerUrl,
    tokenInSymbol: row.token_in_symbol,
    tokenOutSymbol: row.token_out_symbol,
    amountInRaw: row.amount_in_raw,
    tokenInDecimals: row.token_in_decimals,
    usdInEst: row.usd_in_est,
    txHash: row.tx_hash,
    ageSeconds: ageSecondsOf(row),
    executedInRaw: row.executed_in_raw,
    executedOutRaw: row.executed_out_raw,
    tokenOutDecimals: row.token_out_decimals,
    usdOutEst: row.usd_out_est,
    usdFeeEst: row.usd_fee_est,
    usdSource: row.usd_source,
    clientCreatedAt: row.client_created_at.toISOString(),
    clientConfirmedAt: row.client_confirmed_at === null ? null : row.client_confirmed_at.toISOString(),
    failureCode: row.failure_code,
  };
}

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

export type TokenPairDto = {
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
  pairs: TokenPairDto[];
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

export type NetworkTokenDto = {
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
  tokens: NetworkTokenDto[];
  routes: BridgeRouteDto[];
  series: ChartPointDto[];
};

export type ChainTierDto = {
  chainSlug: string;
  displayName: string;
  verificationTier: VerificationTier;
};

export type VerificationLatencyDto = { median: number | null; p90: number | null };

export type VerificationStatsDto = {
  verifiedFull: number;
  verifiedBasic: number;
  queued: number;
  latencySeconds: VerificationLatencyDto;
  chains: ChainTierDto[];
};

export type PricingCoverageDto = {
  pricedActivityCount: number;
  unpricedActivityCount: number;
  pendingActivityCount: number;
  pricedCoverage: number;
};

export function toPricingCoverageDto(read: PricingCoverageRead): PricingCoverageDto {
  const decided = read.pricedActivityCount + read.unpricedActivityCount;
  return {
    pricedActivityCount: read.pricedActivityCount,
    unpricedActivityCount: read.unpricedActivityCount,
    pendingActivityCount: read.pendingActivityCount,
    pricedCoverage: decided === 0 ? 0 : read.pricedActivityCount / decided,
  };
}
