import { describe, expect, it } from "vitest";
import { resolveBridgeChain } from "../bridge-chain.js";

describe("resolveBridgeChain", () => {
  it("resolves the Khalani provider-native Solana id to the solana slug", () => {
    expect(resolveBridgeChain("khalani", 20011000000n)?.canonicalSlug).toBe("solana");
  });

  it("resolves the Relay provider-native Solana id to the solana slug", () => {
    expect(resolveBridgeChain("relay", 792703809n)?.canonicalSlug).toBe("solana");
  });

  it("returns null for a Solana id belonging to another provider", () => {
    expect(resolveBridgeChain("khalani", 792703809n)).toBeNull();
  });

  it("resolves an EVM chain id to its canonical slug", () => {
    expect(resolveBridgeChain("kyberswap", 8453n)?.canonicalSlug).toBe("base");
  });

  it("returns null for a chain id absent from the registry", () => {
    expect(resolveBridgeChain("kyberswap", 999999n)).toBeNull();
  });

  it("resolves an EVM chain id under an unknown protocol", () => {
    expect(resolveBridgeChain("some-unlisted-protocol", 42161n)?.canonicalSlug).toBe("arbitrum");
  });
});
