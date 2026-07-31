import { expect, it } from "vitest";
import { agentAlias, toActivityRowDto, toAgentStatDto, toTxDetailDto, type LookupDto } from "../public-dto.js";

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
});

const BANNED = ["agentHash", "agent_hash", "sourceRowId", "source_row_id", "sourceExecutionId", "source_execution_id", "eventIndex", "event_index"];

it("public DTOs never expose banned identifiers", () => {
  for (const dto of [toActivityRowDto(fixtureActivityRow(), stubResolve), toTxDetailDto(fixtureActivityRow(), stubResolve)]) {
    for (const key of BANNED) expect(key in (dto as object)).toBe(false);
  }
});

it("lookup DTO contains only the publicId", () => {
  const dto: LookupDto = { publicId: "f".repeat(32) };
  expect(Object.keys(dto)).toEqual(["publicId"]);
  for (const key of BANNED) expect(key in dto).toBe(false);
});

const rankedAgentHash = "0123456789abcdef".repeat(4);

it("agent stat DTO exposes only alias, volumeUsd and txCount", () => {
  const dto = toAgentStatDto("agentscan-dev-salt", {
    agentHash: rankedAgentHash,
    volumeUsd: "10.5",
    txCount: 2,
  });
  expect(Object.keys(dto)).toEqual(["alias", "volumeUsd", "txCount"]);
  for (const key of BANNED) expect(key in dto).toBe(false);
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
