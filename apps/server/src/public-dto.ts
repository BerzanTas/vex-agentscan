import type { ResolveChain } from "./app.js";
import type { ActivityDbRow } from "./repos/read-repo.js";

export type StatsDto = {
  dailyVolumeUsd: string;
  totalVolumeUsd: string;
  dailyTx: number;
  totalTx: number;
  activeAgents7d: number;
};

export type ChartPointDto = { day: string; volumeUsd: string; txCount: number };

export type LookupDto = { publicId: string };

export type ProtocolStatDto = { protocol: string; volumeUsd: string; txCount: number };

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

function ageSecondsOf(row: ActivityDbRow): number {
  const anchor = row.client_confirmed_at ?? row.client_created_at;
  return Math.max(0, Math.floor((Date.now() - anchor.getTime()) / 1000));
}

export function toActivityRowDto(row: ActivityDbRow, resolveChain: ResolveChain): ActivityRowDto {
  const chain = chainPresentationFor(row, resolveChain);
  return {
    publicId: row.public_id,
    kind: row.kind,
    eventRole: row.event_role,
    protocol: row.protocol,
    status: row.status,
    verificationState: row.verification_state,
    chainSlug: chain.chainSlug,
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

export function toTxDetailDto(row: ActivityDbRow, resolveChain: ResolveChain): TxDetailDto {
  const chain = chainPresentationFor(row, resolveChain);
  return {
    publicId: row.public_id,
    kind: row.kind,
    eventRole: row.event_role,
    protocol: row.protocol,
    status: row.status,
    verificationState: row.verification_state,
    chainSlug: chain.chainSlug,
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
