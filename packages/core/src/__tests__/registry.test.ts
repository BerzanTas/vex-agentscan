import { describe, expect, it } from "vitest";
import { resolveChain } from "../chain-registry/registry.js";

describe("resolveChain", () => {
  it("maps Khalani and Relay provider-native Solana ids to the same canonical chain at tier basic", () => {
    const khalani = resolveChain({ protocol: "khalani", chainFamily: "solana", chainId: 20011000000n });
    const relay = resolveChain({ protocol: "relay", chainFamily: "solana", chainId: 792703809n });
    expect(khalani?.canonicalSlug).toBe("solana");
    expect(relay?.canonicalSlug).toBe("solana");
    expect(khalani?.verificationTier).toBe("basic");
    expect(relay?.verificationTier).toBe("basic");
  });

  it("returns null for an unknown chain id", () => {
    expect(resolveChain({ protocol: "kyberswap", chainFamily: "eip155", chainId: 999999999n })).toBeNull();
  });

  it("returns null for a provider-native id presented under a different protocol", () => {
    expect(resolveChain({ protocol: "khalani", chainFamily: "solana", chainId: 792703809n })).toBeNull();
  });

  it("resolves Base to a full-tier entry with an explorer tx url", () => {
    const base = resolveChain({ protocol: "kyberswap", chainFamily: "eip155", chainId: 8453n });
    expect(base?.verificationTier).toBe("full");
    expect(base?.canonicalSlug).toBe("base");
    expect(base?.explorerTxUrl("0xabc")).toBe("https://basescan.org/tx/0xabc");
  });
});
