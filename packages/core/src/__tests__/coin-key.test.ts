import { describe, expect, it } from "vitest";
import { resolveCoinKey } from "../pricing/coin-key.js";

const base = { protocol: "kyberswap", chainFamily: "eip155" as const, chainId: 8453n };
const solana = { protocol: "relay", chainFamily: "solana" as const, chainId: 792703809n };

describe("resolveCoinKey", () => {
  it("maps the lowercase EVM native sentinel to the chain native coin key", () => {
    expect(resolveCoinKey({ ...base, tokenAddress: `0x${"e".repeat(40)}` })).toEqual({
      coinKey: `base:0x${"0".repeat(40)}`,
      tokenAddress: `0x${"0".repeat(40)}`,
    });
  });

  it("maps the uppercase EVM native sentinel to the same native coin key", () => {
    expect(resolveCoinKey({ ...base, tokenAddress: `0x${"E".repeat(40)}` })).toEqual({
      coinKey: `base:0x${"0".repeat(40)}`,
      tokenAddress: `0x${"0".repeat(40)}`,
    });
  });

  it("maps the EVM zero address to the chain native coin key", () => {
    expect(resolveCoinKey({ ...base, tokenAddress: `0x${"0".repeat(40)}` })).toEqual({
      coinKey: `base:0x${"0".repeat(40)}`,
      tokenAddress: `0x${"0".repeat(40)}`,
    });
  });

  it("lowercases a checksummed EVM contract address and prefixes it with the feed key", () => {
    expect(
      resolveCoinKey({
        ...base,
        chainId: 1n,
        tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      }),
    ).toEqual({
      coinKey: "ethereum:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      tokenAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    });
  });

  it("preserves base58 case for a solana mint", () => {
    expect(resolveCoinKey({ ...solana, tokenAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" })).toEqual({
      coinKey: "solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      tokenAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    });
  });

  it("maps a robinhood ERC-20 address with the robinhood feed key", () => {
    expect(resolveCoinKey({ ...base, chainId: 4663n, tokenAddress: `0x${"1".repeat(40)}` })).toEqual({
      coinKey: `robinhood:0x${"1".repeat(40)}`,
      tokenAddress: `0x${"1".repeat(40)}`,
    });
  });

  it("maps the unichain USDC morpho lends against with the unichain feed key", () => {
    expect(
      resolveCoinKey({
        ...base,
        chainId: 130n,
        tokenAddress: "0x078D782b760474a361dDA0AF3839290b0EF57AD6",
      }),
    ).toEqual({
      coinKey: "unichain:0x078d782b760474a361dda0af3839290b0ef57ad6",
      tokenAddress: "0x078d782b760474a361dda0af3839290b0ef57ad6",
    });
  });

  it("maps the monad USDC morpho lends against with the monad feed key", () => {
    expect(
      resolveCoinKey({
        ...base,
        chainId: 143n,
        tokenAddress: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
      }),
    ).toEqual({
      coinKey: "monad:0x754704bc059f8c67012fed69bc8a327a5aafb603",
      tokenAddress: "0x754704bc059f8c67012fed69bc8a327a5aafb603",
    });
  });

  it("maps a hyperevm token with the hyperliquid feed key the coins API publishes", () => {
    expect(
      resolveCoinKey({
        ...base,
        chainId: 999n,
        tokenAddress: "0xb88339CB7199b77E23DB6E890353E22632Ba630f",
      }),
    ).toEqual({
      coinKey: "hyperliquid:0xb88339cb7199b77e23db6e890353e22632ba630f",
      tokenAddress: "0xb88339cb7199b77e23db6e890353e22632ba630f",
    });
  });

  it("yields no key for a chain that is not in the registry", () => {
    expect(resolveCoinKey({ ...base, chainId: 999999n, tokenAddress: `0x${"1".repeat(40)}` })).toBeNull();
  });

  it("yields no key for an EVM address that is not 20 bytes", () => {
    expect(resolveCoinKey({ ...base, tokenAddress: "0xdeadbeef" })).toBeNull();
  });

  it("yields no key for a solana mint outside the base58 alphabet", () => {
    expect(resolveCoinKey({ ...solana, tokenAddress: `0x${"1".repeat(40)}` })).toBeNull();
  });

  it("maps the EVM native sentinel on robinhood to the robinhood native coin key", () => {
    expect(resolveCoinKey({ ...base, chainId: 4663n, tokenAddress: `0x${"e".repeat(40)}` })).toEqual({
      coinKey: `robinhood:0x${"0".repeat(40)}`,
      tokenAddress: `0x${"0".repeat(40)}`,
    });
  });
});

describe("the price feed key of every swap and bridge chain", () => {
  const feeds = [
  { chainId: 56n, feedKey: "bsc" },
  { chainId: 43114n, feedKey: "avalanche" },
  { chainId: 59144n, feedKey: "linea" },
  { chainId: 5000n, feedKey: "mantle" },
  { chainId: 80094n, feedKey: "berachain" },
  { chainId: 146n, feedKey: "sonic" },
  { chainId: 9745n, feedKey: "plasma" },
  { chainId: 2020n, feedKey: "ronin" },
  { chainId: 4326n, feedKey: "megaeth" },
  ];

  it.each(feeds)("prefixes an ERC-20 on chain $chainId with the $feedKey feed key", ({ chainId, feedKey }) => {
    expect(resolveCoinKey({ ...base, chainId, tokenAddress: `0x${"1".repeat(40)}` })).toEqual({
      coinKey: `${feedKey}:0x${"1".repeat(40)}`,
      tokenAddress: `0x${"1".repeat(40)}`,
    });
  });
});
