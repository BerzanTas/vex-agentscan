import type { FailureCode, IngestEvent } from "@agentscan/contract";

export type SimRng = () => number;

export function mulberry32(seed: number): SimRng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const HEX_DIGITS = "0123456789abcdef";
const INGEST_TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function charsFrom(rng: SimRng, alphabet: string, length: number): string {
  let result = "";
  for (let index = 0; index < length; index += 1) {
    result += alphabet.charAt(Math.floor(rng() * alphabet.length));
  }
  return result;
}

function randomInt(rng: SimRng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function pick<T>(rng: SimRng, values: readonly T[]): T {
  const value = values[Math.floor(rng() * values.length)];
  if (value === undefined) throw new Error("cannot pick from an empty pool");
  return value;
}

export type SimAgent = { agentHash: string; ingestToken: string };

export function deriveSimAgents(seed: number, count: number): SimAgent[] {
  return Array.from({ length: count }, (_, index) => {
    const rng = mulberry32((seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0);
    return {
      agentHash: charsFrom(rng, HEX_DIGITS, 64),
      ingestToken: charsFrom(rng, INGEST_TOKEN_ALPHABET, 43),
    };
  });
}

type SimToken = { address: string; symbol: string; decimals: number; priceCents: bigint };

const WETH: SimToken = {
  address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  symbol: "WETH",
  decimals: 18,
  priceCents: 330000n,
};
const USDC: SimToken = {
  address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  symbol: "USDC",
  decimals: 6,
  priceCents: 100n,
};
const VEX: SimToken = {
  address: "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2",
  symbol: "VEX",
  decimals: 18,
  priceCents: 85n,
};
const ARB: SimToken = {
  address: "0x912ce59144191c1204e64559fe8253a0e49e6548",
  symbol: "ARB",
  decimals: 18,
  priceCents: 45n,
};
const SOL: SimToken = {
  address: "So11111111111111111111111111111111111111112",
  symbol: "SOL",
  decimals: 9,
  priceCents: 15000n,
};

const SWAP_TOKENS = [WETH, USDC, VEX, ARB] as const;
const BRIDGE_EVM_TOKENS = [WETH, USDC] as const;
const SWAP_PROTOCOLS = ["kyberswap", "uniswap"] as const;
const SWAP_CHAIN_IDS = [1n, 8453n, 42161n, 10n, 137n] as const;
const BRIDGE_PROTOCOLS = ["khalani", "relay"] as const;
const SOLANA_CHAIN_ID_BY_BRIDGE: Record<(typeof BRIDGE_PROTOCOLS)[number], bigint> = {
  khalani: 20011000000n,
  relay: 792703809n,
};
const SWAP_FAILURE_CODES: readonly FailureCode[] = [
  "slippage",
  "deadline_expired",
  "insufficient_liquidity",
  "route_not_found",
  "allowance_or_balance",
  "simulation_reverted",
];
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_BATCH_SIZE = 500;

function usdStringFrom(cents: bigint): string {
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

function rawAmountFor(usdCents: bigint, token: SimToken): string {
  return ((usdCents * 10n ** BigInt(token.decimals)) / token.priceCents).toString();
}

function tokenView(token: SimToken): { address: string; symbol: string; decimals: number } {
  return { address: token.address, symbol: token.symbol, decimals: token.decimals };
}

type SimIds = { sourceRowId: string; sourceExecutionId: string };

type RequiredEventFields = Pick<
  IngestEvent,
  | "sourceRowId"
  | "sourceExecutionId"
  | "eventIndex"
  | "kind"
  | "eventRole"
  | "status"
  | "protocol"
  | "chainFamily"
  | "chainId"
  | "createdAt"
>;

function ingestEvent(fields: RequiredEventFields & Partial<IngestEvent>): IngestEvent {
  return {
    fromChainId: null,
    toChainId: null,
    tokenIn: null,
    tokenOut: null,
    amountInRaw: null,
    amountOutRaw: null,
    executedInRaw: null,
    executedOutRaw: null,
    usdInEst: null,
    usdOutEst: null,
    usdFeeEst: null,
    usdSource: null,
    txHash: null,
    failureCode: null,
    confirmedAt: null,
    observedAt: null,
    ...fields,
  };
}

type SwapQuote = {
  tokenIn: SimToken;
  tokenOut: SimToken;
  amountInRaw: string;
  amountOutRaw: string;
  usdInEst: string;
  usdOutEst: string;
  usdFeeEst: string;
};

function maxCents(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

function swapQuote(rng: SimRng): SwapQuote {
  const tokenIn = pick(rng, SWAP_TOKENS);
  const tokenOut = pick(
    rng,
    SWAP_TOKENS.filter((token) => token.symbol !== tokenIn.symbol),
  );
  const usdInCents = BigInt(randomInt(rng, 1200, 800000));
  const feeCents = maxCents(1n, (usdInCents * BigInt(randomInt(rng, 10, 80))) / 10000n);
  const usdOutCents = usdInCents - feeCents;
  return {
    tokenIn,
    tokenOut,
    amountInRaw: rawAmountFor(usdInCents, tokenIn),
    amountOutRaw: rawAmountFor(usdOutCents, tokenOut),
    usdInEst: usdStringFrom(usdInCents),
    usdOutEst: usdStringFrom(usdOutCents),
    usdFeeEst: usdStringFrom(feeCents),
  };
}

function evmTxHash(rng: SimRng): string {
  return `0x${charsFrom(rng, HEX_DIGITS, 64)}`;
}

function txHashFor(rng: SimRng, chainFamily: "eip155" | "solana"): string {
  return chainFamily === "eip155" ? evmTxHash(rng) : charsFrom(rng, BASE58_ALPHABET, 88);
}

function confirmedSwapEvent(rng: SimRng, ids: SimIds, confirmedAt: Date): IngestEvent {
  const quote = swapQuote(rng);
  const createdAt = new Date(confirmedAt.getTime() - randomInt(rng, 5, 120) * 1000);
  return ingestEvent({
    ...ids,
    eventIndex: 0,
    kind: "swap",
    eventRole: "swap",
    status: "confirmed",
    protocol: pick(rng, SWAP_PROTOCOLS),
    chainFamily: "eip155",
    chainId: pick(rng, SWAP_CHAIN_IDS),
    tokenIn: tokenView(quote.tokenIn),
    tokenOut: tokenView(quote.tokenOut),
    amountInRaw: quote.amountInRaw,
    amountOutRaw: quote.amountOutRaw,
    usdInEst: quote.usdInEst,
    usdOutEst: quote.usdOutEst,
    usdFeeEst: quote.usdFeeEst,
    usdSource: "sim_quote",
    txHash: evmTxHash(rng),
    createdAt: createdAt.toISOString(),
    confirmedAt: confirmedAt.toISOString(),
  });
}

function failedSwapEvent(rng: SimRng, ids: SimIds, failedAt: Date): IngestEvent {
  const confirmed = confirmedSwapEvent(rng, ids, failedAt);
  return {
    ...confirmed,
    status: "definitively_failed",
    failureCode: pick(rng, SWAP_FAILURE_CODES),
    txHash: null,
    confirmedAt: null,
    observedAt: failedAt.toISOString(),
  };
}

function bridgeLegEvents(
  rng: SimRng,
  sourceExecutionId: string,
  rowIds: [string, string],
  depositConfirmedAt: Date,
  fillConfirmedAt: Date,
): [IngestEvent, IngestEvent] {
  const protocol = pick(rng, BRIDGE_PROTOCOLS);
  const solanaChainId = SOLANA_CHAIN_ID_BY_BRIDGE[protocol];
  const evmChainId = pick(rng, SWAP_CHAIN_IDS);
  const evmToken = pick(rng, BRIDGE_EVM_TOKENS);
  const solanaSide = { chainFamily: "solana" as const, chainId: solanaChainId, token: SOL };
  const evmSide = { chainFamily: "eip155" as const, chainId: evmChainId, token: evmToken };
  const solanaIsSource = rng() < 0.5;
  const source = solanaIsSource ? solanaSide : evmSide;
  const destination = solanaIsSource ? evmSide : solanaSide;
  const usdInCents = BigInt(randomInt(rng, 2500, 500000));
  const feeCents = maxCents(1n, (usdInCents * BigInt(randomInt(rng, 20, 120))) / 10000n);
  const usdOutCents = usdInCents - feeCents;
  const createdAt = new Date(depositConfirmedAt.getTime() - randomInt(rng, 10, 180) * 1000);
  const shared = {
    sourceExecutionId,
    kind: "bridge" as const,
    status: "confirmed" as const,
    protocol,
    fromChainId: source.chainId,
    toChainId: destination.chainId,
    usdSource: "sim_quote",
    createdAt: createdAt.toISOString(),
  };
  const deposit = ingestEvent({
    ...shared,
    sourceRowId: rowIds[0],
    eventIndex: 0,
    eventRole: "bridge_deposit",
    chainFamily: source.chainFamily,
    chainId: source.chainId,
    tokenIn: tokenView(source.token),
    tokenOut: tokenView(destination.token),
    amountInRaw: rawAmountFor(usdInCents, source.token),
    amountOutRaw: rawAmountFor(usdOutCents, destination.token),
    usdInEst: usdStringFrom(usdInCents),
    usdOutEst: usdStringFrom(usdOutCents),
    usdFeeEst: usdStringFrom(feeCents),
    txHash: txHashFor(rng, source.chainFamily),
    confirmedAt: depositConfirmedAt.toISOString(),
  });
  const fill = ingestEvent({
    ...shared,
    sourceRowId: rowIds[1],
    eventIndex: 1,
    eventRole: "bridge_fill_expected",
    chainFamily: destination.chainFamily,
    chainId: destination.chainId,
    tokenOut: tokenView(destination.token),
    amountOutRaw: rawAmountFor(usdOutCents, destination.token),
    usdOutEst: usdStringFrom(usdOutCents),
    txHash: txHashFor(rng, destination.chainFamily),
    confirmedAt: fillConfirmedAt.toISOString(),
  });
  return [deposit, fill];
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function startOfUtcDayMs(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export type BackfillOptions = { days: number; perDay: number; now: Date; maxBatchSize?: number };

export function generateBackfill(rng: SimRng, opts: BackfillOptions): IngestEvent[][] {
  const runTag = charsFrom(rng, HEX_DIGITS, 8);
  const dayStartMs = startOfUtcDayMs(opts.now);
  const totalActivities = Math.max(1, Math.round(opts.days * opts.perDay));
  const events: IngestEvent[] = [];
  let rowSequence = 0;
  const nextRowId = (): string => {
    rowSequence += 1;
    return `${runTag}-bf-${rowSequence}`;
  };
  for (let activity = 0; activity < totalActivities; activity += 1) {
    const confirmedAt = new Date(
      dayStartMs - randomInt(rng, 1, opts.days) * DAY_MS + randomInt(rng, 0, 86399) * 1000,
    );
    const sourceExecutionId = `${runTag}-bfx-${activity}`;
    const mixRoll = rng();
    if (mixRoll < 0.6) {
      events.push(confirmedSwapEvent(rng, { sourceRowId: nextRowId(), sourceExecutionId }, confirmedAt));
      continue;
    }
    if (mixRoll < 0.9) {
      const fillConfirmedAt = new Date(confirmedAt.getTime() + randomInt(rng, 20, 240) * 1000);
      events.push(...bridgeLegEvents(rng, sourceExecutionId, [nextRowId(), nextRowId()], confirmedAt, fillConfirmedAt));
      continue;
    }
    events.push(failedSwapEvent(rng, { sourceRowId: nextRowId(), sourceExecutionId }, confirmedAt));
  }
  return chunk(events, opts.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE);
}

export type SimLiveState = { runTag: string; sequence: number; now: Date };

export function initialLiveState(rng: SimRng, now: Date): SimLiveState {
  return { runTag: charsFrom(rng, HEX_DIGITS, 8), sequence: 0, now };
}

export type SimScenarioStep = { afterMs: number; event: IngestEvent };

export type SimScenario = {
  label: "instant_swap" | "pending_confirm" | "pending_fail" | "bridge";
  steps: SimScenarioStep[];
  state: SimLiveState;
};

function liveIds(state: SimLiveState, offset: number): SimIds {
  const sequence = state.sequence + offset;
  return {
    sourceRowId: `${state.runTag}-live-${sequence}`,
    sourceExecutionId: `${state.runTag}-livex-${sequence}`,
  };
}

function advance(state: SimLiveState, activities: number): SimLiveState {
  return { ...state, sequence: state.sequence + activities };
}

function instantSwapScenario(rng: SimRng, state: SimLiveState): SimScenario {
  const event = confirmedSwapEvent(rng, liveIds(state, 0), state.now);
  return { label: "instant_swap", steps: [{ afterMs: 0, event }], state: advance(state, 1) };
}

function pendingSwapPair(rng: SimRng, state: SimLiveState): { pending: IngestEvent; confirmed: IngestEvent; afterMs: number } {
  const afterMs = randomInt(rng, 5000, 20000);
  const confirmed = {
    ...confirmedSwapEvent(rng, liveIds(state, 0), new Date(state.now.getTime() + afterMs)),
    createdAt: state.now.toISOString(),
  };
  const pending: IngestEvent = { ...confirmed, status: "pending", txHash: null, confirmedAt: null };
  return { pending, confirmed, afterMs };
}

function pendingConfirmScenario(rng: SimRng, state: SimLiveState): SimScenario {
  const { pending, confirmed, afterMs } = pendingSwapPair(rng, state);
  return {
    label: "pending_confirm",
    steps: [
      { afterMs: 0, event: pending },
      { afterMs, event: confirmed },
    ],
    state: advance(state, 1),
  };
}

function pendingFailScenario(rng: SimRng, state: SimLiveState): SimScenario {
  const { pending, afterMs } = pendingSwapPair(rng, state);
  const failed: IngestEvent = {
    ...pending,
    status: "definitively_failed",
    failureCode: pick(rng, SWAP_FAILURE_CODES),
    observedAt: new Date(state.now.getTime() + afterMs).toISOString(),
  };
  return {
    label: "pending_fail",
    steps: [
      { afterMs: 0, event: pending },
      { afterMs, event: failed },
    ],
    state: advance(state, 1),
  };
}

function bridgeScenario(rng: SimRng, state: SimLiveState): SimScenario {
  const fillAfterMs = randomInt(rng, 2000, 8000);
  const [deposit, fill] = bridgeLegEvents(
    rng,
    liveIds(state, 0).sourceExecutionId,
    [liveIds(state, 0).sourceRowId, liveIds(state, 1).sourceRowId],
    state.now,
    new Date(state.now.getTime() + fillAfterMs),
  );
  return {
    label: "bridge",
    steps: [
      { afterMs: 0, event: deposit },
      { afterMs: fillAfterMs, event: fill },
    ],
    state: advance(state, 2),
  };
}

export function nextLiveScenario(rng: SimRng, state: SimLiveState): SimScenario {
  const mixRoll = rng();
  if (mixRoll < 0.4) return instantSwapScenario(rng, state);
  if (mixRoll < 0.7) return pendingConfirmScenario(rng, state);
  if (mixRoll < 0.8) return pendingFailScenario(rng, state);
  return bridgeScenario(rng, state);
}

const LOCAL_API_HOSTS = new Set(["localhost", "127.0.0.1"]);

export type ApiUrlCheck = { ok: true } | { ok: false; reason: string };

export function checkSimApiUrl(rawUrl: string, allowRemote: boolean): ApiUrlCheck {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: `SIM_API_URL "${rawUrl}" is not a valid URL` };
  }
  if (allowRemote || LOCAL_API_HOSTS.has(parsed.hostname)) return { ok: true };
  return {
    ok: false,
    reason: `SIM_API_URL host "${parsed.hostname}" is not localhost/127.0.0.1; pass --allow-remote to target a non-local API deliberately`,
  };
}
