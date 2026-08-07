import { encodeAbiParameters, parseAbiParameters, toEventSelector, type Address, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { decodeTokenCreationEvents } from "../trench-creation-event.js";

const TOKEN_CREATED_TOPIC0 = toEventSelector("TokenCreated(address,address,uint8,uint8,bytes,uint256)");
const TOKEN_CREATED_PARAMS = parseAbiParameters("address token, address creator, uint8 strategy, uint8 dex, bytes data, uint256 price");

const factoryAddress = "0x3857c6c4fe93abb40945dfc8b9d690384cbae014" as Address;
const tokenAddress = "0x1111111111111111111111111111111111111111" as Address;
const creatorAddress = "0x2222222222222222222222222222222222222222" as Address;

function encodedTokenCreatedData(token: Address, creator: Address): Hex {
  return encodeAbiParameters(TOKEN_CREATED_PARAMS, [token, creator, 0, 0, "0x", 1n]);
}

function tokenCreatedLog(overrides: { address?: Address; token?: Address; creator?: Address } = {}) {
  return {
    address: overrides.address ?? factoryAddress,
    topics: [TOKEN_CREATED_TOPIC0],
    data: encodedTokenCreatedData(overrides.token ?? tokenAddress, overrides.creator ?? creatorAddress),
  };
}

describe("decodeTokenCreationEvents", () => {
  it("decodes a well-formed TokenCreated log into a lowercased creation event", () => {
    const events = decodeTokenCreationEvents([tokenCreatedLog()]);

    expect(events).toEqual([
      { emitterAddress: factoryAddress, tokenAddress, creatorAddress },
    ]);
  });

  it("preserves the emitting log's own address, not any fixed constant", () => {
    const otherEmitter = "0x9999999999999999999999999999999999999999".slice(0, 42) as Address;
    const events = decodeTokenCreationEvents([tokenCreatedLog({ address: otherEmitter })]);

    expect(events).toEqual([{ emitterAddress: otherEmitter, tokenAddress, creatorAddress }]);
  });

  it("ignores logs whose topic0 does not match the TokenCreated selector", () => {
    const unrelatedTopic = toEventSelector("Transfer(address,address,uint256)");
    const events = decodeTokenCreationEvents([{ address: factoryAddress, topics: [unrelatedTopic], data: "0x" }]);

    expect(events).toEqual([]);
  });

  it("skips a same-topic log that fails to decode instead of throwing", () => {
    const matchingTopicGarbageData = { address: factoryAddress, topics: [tokenCreatedLog().topics[0] as Hex], data: "0x1234" };

    expect(() => decodeTokenCreationEvents([matchingTopicGarbageData])).not.toThrow();
    expect(decodeTokenCreationEvents([matchingTopicGarbageData])).toEqual([]);
  });

  it("decodes every matching log when a receipt contains multiple creations", () => {
    const secondToken = "0x3333333333333333333333333333333333333333" as Address;

    const events = decodeTokenCreationEvents([
      tokenCreatedLog(),
      tokenCreatedLog({ token: secondToken }),
    ]);

    expect(events).toEqual([
      { emitterAddress: factoryAddress, tokenAddress, creatorAddress },
      { emitterAddress: factoryAddress, tokenAddress: secondToken, creatorAddress },
    ]);
  });
});
