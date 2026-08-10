import { expect, it } from "vitest";
import {
  agentAlias,
  toActivityRowDto,
  toAgentStatDto,
  toTxDetailDto,
  type BridgeRouteDto,
  type LookupDto,
  type NetworkDetailDto,
  type NetworkStatDto,
  type ResolveBridgeChain,
  type TokenDetailDto,
  type TokenStatDto,
  type VerificationStatsDto,
} from "../public-dto.js";

const stubResolve = () => null;
const fixtureActivityRow = () => ({
  id: 1n, agent_hash: "a".repeat(64), source_row_id: "44210", public_id: "f".repeat(32),
  source_execution_id: "9021", event_index: 0, kind: "swap", event_role: "swap",
  status: "confirmed", protocol: "kyberswap", chain_family: "eip155", chain_id: 8453n,
  from_chain_id: null, to_chain_id: null,
  token_in_address: "0xabc", token_in_symbol: "ETH", token_in_decimals: 18,
  token_out_address: "0xdef", token_out_symbol: "VEX", token_out_decimals: 18,
  amount_in_raw: "1000", amount_out_raw: "2000", executed_in_raw: "1000", executed_out_raw: "1990",
  usd_in_est: "3312.44", usd_out_est: "3305.12", usd_fee_est: "3.31", usd_source: "kyberswap_quote",
  tx_hash: "0x123", failure_code: null,
  client_created_at: new Date(), client_confirmed_at: new Date(), client_observed_at: null,
  statuses_seen: ["pending", "confirmed"], verification_state: "verified_full",
  verified_at: new Date(), backfill: false, received_at: new Date(), received_schema_version: 1,
  event_time: new Date(),
});

const BANNED = ["agentHash", "agent_hash", "sourceRowId", "source_row_id", "sourceExecutionId", "source_execution_id", "eventIndex", "event_index"];

it("public DTOs never expose banned identifiers", () => {
  for (const dto of [toActivityRowDto(fixtureActivityRow(), stubResolve), toTxDetailDto(fixtureActivityRow(), stubResolve)]) {
    for (const key of BANNED) expect(key in (dto as object)).toBe(false);
  }
});

const secondLegAndCostColumns = {
  token_in2_address: "0x111",
  token_in2_symbol: "PT-USDC",
  token_in2_decimals: 6,
  token_out2_address: "0x222",
  token_out2_symbol: "YT-USDC",
  token_out2_decimals: 6,
  amount_in2_raw: "1000000",
  amount_out2_raw: "2000000",
  executed_in2_raw: "999000",
  executed_out2_raw: "1999000",
  usd_network_gas_est: "0.42",
  usd_venue_fee_est: "0.15",
  usd_vex_fee_est: "0.05",
  usd_destination_prepay_est: "1.20",
};

const widenedActivityRow = () => ({ ...fixtureActivityRow(), ...secondLegAndCostColumns });

it("public DTOs never expose banned identifiers on a row carrying the widened columns", () => {
  for (const dto of [
    toActivityRowDto(widenedActivityRow(), stubResolve),
    toTxDetailDto(widenedActivityRow(), stubResolve),
  ]) {
    for (const key of BANNED) expect(key in (dto as object)).toBe(false);
  }
});

const UNPUBLISHED_ESTIMATE_FIELDS = [
  "tokenIn2Symbol",
  "tokenOut2Symbol",
  "tokenIn2Decimals",
  "tokenOut2Decimals",
  "amountIn2Raw",
  "amountOut2Raw",
  "executedIn2Raw",
  "executedOut2Raw",
  "usdNetworkGasEst",
  "usdVenueFeeEst",
  "usdVexFeeEst",
  "usdDestinationPrepayEst",
];

it("public DTOs publish no second-leg or cost-breakdown client estimate", () => {
  for (const dto of [
    toActivityRowDto(widenedActivityRow(), stubResolve),
    toTxDetailDto(widenedActivityRow(), stubResolve),
  ]) {
    for (const field of UNPUBLISHED_ESTIMATE_FIELDS) expect(field in (dto as object)).toBe(false);
    const serialised = JSON.stringify(dto);
    expect(serialised).not.toContain("PT-USDC");
    expect(serialised).not.toContain("YT-USDC");
  }
});

it("lookup DTO contains only the publicId", () => {
  const dto: LookupDto = { publicId: "f".repeat(32) };
  expect(Object.keys(dto)).toEqual(["publicId"]);
  for (const key of BANNED) expect(key in dto).toBe(false);
});

const rankedAgentHash = "0123456789abcdef".repeat(4);

const rankedAgentRead = {
  agentHash: rankedAgentHash,
  volumeUsd: "10.5",
  txCount: 2,
  protocolCount: 2,
  chainCount: 3,
  lastSeenSeconds: 42,
};

it("agent stat DTO exposes only the ranking fields and never the agent hash", () => {
  const dto = toAgentStatDto("agentscan-dev-salt", rankedAgentRead, null);
  expect(Object.keys(dto)).toEqual([
    "alias",
    "name",
    "volumeUsd",
    "txCount",
    "protocolCount",
    "chainCount",
    "lastSeenSeconds",
  ]);
  for (const key of BANNED) expect(key in dto).toBe(false);
});

it("agent stat DTO carries the public name of a bound agent beside its alias", () => {
  const dto = toAgentStatDto("agentscan-dev-salt", rankedAgentRead, "Vex-01234567");
  expect(dto.name).toBe("Vex-01234567");
  expect(dto.alias).toMatch(/^agent-[0-9a-f]{8}$/);
});

it("agent alias is stable for the same salt", () => {
  const alias = agentAlias("salt-a", rankedAgentHash);
  expect(agentAlias("salt-a", rankedAgentHash)).toBe(alias);
  expect(alias).toMatch(/^agent-[0-9a-f]{8}$/);
});

it("agent alias changes when the salt changes", () => {
  expect(agentAlias("salt-a", rankedAgentHash)).not.toBe(agentAlias("salt-b", rankedAgentHash));
});

it("agent alias is never a prefix or fragment of the agent hash", () => {
  const aliasHex = agentAlias("agentscan-dev-salt", rankedAgentHash).slice("agent-".length);
  expect(rankedAgentHash.startsWith(aliasHex)).toBe(false);
  expect(rankedAgentHash.includes(aliasHex)).toBe(false);
});

const fakeBridgeChains = new Map([
  ["relay:8453", "base"],
  ["relay:792703809", "solana"],
]);

const fakeResolveBridgeChain: ResolveBridgeChain = (protocol, chainId) => {
  const canonicalSlug = fakeBridgeChains.get(`${protocol}:${chainId}`);
  if (canonicalSlug === undefined) return null;
  return {
    canonicalSlug,
    displayName: canonicalSlug,
    explorerTxUrl: () => null,
    rpcUrls: [],
    verificationTier: "basic",
  };
};

const fixtureBridgeRow = (fromChainId: bigint | null, toChainId: bigint | null) => ({
  ...fixtureActivityRow(),
  kind: "bridge",
  event_role: "bridge_send",
  protocol: "relay",
  from_chain_id: fromChainId,
  to_chain_id: toChainId,
});

it("swap rows carry no bridge route slugs even when their chain ids resolve", () => {
  const swapWithChainIds = { ...fixtureActivityRow(), protocol: "relay", from_chain_id: 8453n, to_chain_id: 792703809n };
  const dto = toActivityRowDto(swapWithChainIds, stubResolve, fakeResolveBridgeChain);
  expect(dto.fromChainSlug).toBe(null);
  expect(dto.toChainSlug).toBe(null);
});

it("bridge rows expose the slug of each resolvable leg", () => {
  const dto = toActivityRowDto(fixtureBridgeRow(8453n, 792703809n), stubResolve, fakeResolveBridgeChain);
  expect(dto.fromChainSlug).toBe("base");
  expect(dto.toChainSlug).toBe("solana");
});

it("bridge detail rows expose the slug of each resolvable leg", () => {
  const dto = toTxDetailDto(fixtureBridgeRow(8453n, 792703809n), stubResolve, fakeResolveBridgeChain);
  expect(dto.fromChainSlug).toBe("base");
  expect(dto.toChainSlug).toBe("solana");
});

it("an unresolvable bridge leg becomes null and leaves the other leg intact", () => {
  const dto = toActivityRowDto(fixtureBridgeRow(8453n, 20011000000n), stubResolve, fakeResolveBridgeChain);
  expect(dto.fromChainSlug).toBe("base");
  expect(dto.toChainSlug).toBe(null);
});

it("a bridge leg without a chain id becomes null", () => {
  const dto = toActivityRowDto(fixtureBridgeRow(null, 8453n), stubResolve, fakeResolveBridgeChain);
  expect(dto.fromChainSlug).toBe(null);
  expect(dto.toChainSlug).toBe("base");
});

it("ages a row from the event time the feed sorts on, not from any other stamp it carries", () => {
  const row = {
    ...fixtureActivityRow(),
    event_time: new Date(Date.now() - 600_000),
    client_created_at: new Date(Date.now() - 7_200_000),
    client_confirmed_at: new Date(Date.now() - 3_600_000),
    received_at: new Date(),
  };

  expect(Math.round(toActivityRowDto(row, stubResolve).ageSeconds / 60)).toBe(10);
  expect(Math.round(toTxDetailDto(row, stubResolve).ageSeconds / 60)).toBe(10);
});

it("a launch row serves with no bridge route slugs and its kind intact", () => {
  const launchRow = { ...fixtureActivityRow(), kind: "launch", event_role: "token_launch" };
  const dto = toActivityRowDto(launchRow, stubResolve, fakeResolveBridgeChain);
  expect(dto.kind).toBe("launch");
  expect(dto.eventRole).toBe("token_launch");
  expect(dto.fromChainSlug).toBe(null);
  expect(dto.toChainSlug).toBe(null);
});

const tokenStat: TokenStatDto = {
  chainSlug: "base",
  address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  symbol: "USDC",
  volumeUsd: "3312.44",
  txCount: 2,
  agentCount: 1,
  protocols: ["kyberswap"],
  lastSeenSeconds: 42,
  series: [{ bucketStart: 1754438400, volumeUsd: "3312.44", txCount: 2 }],
};

const tokenDetail: TokenDetailDto = {
  chainSlug: "base",
  address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  symbol: "USDC",
  decimals: 6,
  volumeUsd: "3312.44",
  txCount: 2,
  agentCount: 1,
  protocols: [{ protocol: "kyberswap", volumeUsd: "3312.44", txCount: 2 }],
  pairs: [{ tokenInSymbol: "USDC", tokenOutSymbol: "WETH", txCount: 2 }],
  series: [{ bucketStart: 1754438400, volumeUsd: "3312.44", txCount: 2 }],
};

const networkStat: NetworkStatDto = {
  chainSlug: "base",
  displayName: "Base",
  verificationTier: "full",
  volumeUsd: "3312.44",
  txCount: 2,
  bridgeInCount: 1,
  bridgeOutCount: 0,
  lastSeenSeconds: 42,
};

const bridgeRoute: BridgeRouteDto = {
  fromChainSlug: "base",
  toChainSlug: "solana",
  legCount: 3,
  volumeUsd: "120.00",
};

const networkDetail: NetworkDetailDto = {
  chainSlug: "base",
  displayName: "Base",
  verificationTier: "full",
  volumeUsd: "3312.44",
  txCount: 2,
  protocols: [{ protocol: "kyberswap", volumeUsd: "3312.44", txCount: 2 }],
  tokens: [{ address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC", volumeUsd: "3312.44", txCount: 2 }],
  routes: [bridgeRoute],
  series: [{ bucketStart: 1754438400, volumeUsd: "3312.44", txCount: 2 }],
};

const verificationStats: VerificationStatsDto = {
  verifiedFull: 12,
  verifiedBasic: 3,
  queued: 1,
  latencySeconds: { median: 8, p90: 41 },
  chains: [{ chainSlug: "base", displayName: "Base", verificationTier: "full" }],
};

function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, nested]) => [key, ...keysOf(nested)]);
}

const dimensionDtos: Array<[string, object]> = [
  ["TokenStatDto", tokenStat],
  ["TokenDetailDto", tokenDetail],
  ["NetworkStatDto", networkStat],
  ["NetworkDetailDto", networkDetail],
  ["BridgeRouteDto", bridgeRoute],
  ["VerificationStatsDto", verificationStats],
];

it.each(dimensionDtos)("%s never exposes banned identifiers, at any depth", (_name, dto) => {
  const serialised = JSON.parse(JSON.stringify(dto)) as unknown;
  expect(keysOf(serialised).filter((key) => BANNED.includes(key))).toEqual([]);
});

it("bridge activity DTOs never expose banned identifiers", () => {
  const bridgeRow = fixtureBridgeRow(8453n, 792703809n);
  for (const dto of [
    toActivityRowDto(bridgeRow, stubResolve, fakeResolveBridgeChain),
    toTxDetailDto(bridgeRow, stubResolve, fakeResolveBridgeChain),
  ]) {
    const serialised = JSON.parse(JSON.stringify(dto)) as unknown;
    expect(keysOf(serialised).filter((key) => BANNED.includes(key))).toEqual([]);
  }
});

it("every monetary field of the dimension DTOs stays a string", () => {
  const monetary = [
    tokenStat.volumeUsd,
    tokenDetail.volumeUsd,
    tokenDetail.protocols[0]?.volumeUsd,
    tokenDetail.series[0]?.volumeUsd,
    networkStat.volumeUsd,
    networkDetail.volumeUsd,
    networkDetail.tokens[0]?.volumeUsd,
    bridgeRoute.volumeUsd,
  ];
  for (const value of monetary) expect(typeof value).toBe("string");
});
