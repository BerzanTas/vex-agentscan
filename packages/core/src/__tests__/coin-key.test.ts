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

  it("yields no key for a registry chain without a price feed key", () => {
    expect(resolveCoinKey({ ...base, chainId: 4663n, tokenAddress: `0x${"1".repeat(40)}` })).toBeNull();
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

  it("never falls back to the canonical slug when the chain has no feed key", () => {
    expect(resolveCoinKey({ ...base, chainId: 4663n, tokenAddress: `0x${"e".repeat(40)}` })).toBeNull();
  });
});
