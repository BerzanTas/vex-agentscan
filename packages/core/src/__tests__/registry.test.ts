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

  it("maps the Jupiter provider-native Solana id to the canonical solana chain at tier basic", () => {
    const jupiter = resolveChain({ protocol: "jupiter", chainFamily: "solana", chainId: 20011000000n });
    expect(jupiter?.canonicalSlug).toBe("solana");
    expect(jupiter?.verificationTier).toBe("basic");
    expect(jupiter?.rpcUrls).toEqual(["https://api.mainnet-beta.solana.com"]);
  });

  it("returns null for an unknown protocol on solana", () => {
    expect(resolveChain({ protocol: "unknownswap", chainFamily: "solana", chainId: 20011000000n })).toBeNull();
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

  it("carries the chain family on every resolved entry", () => {
    const base = resolveChain({ protocol: "kyberswap", chainFamily: "eip155", chainId: 8453n });
    const solana = resolveChain({ protocol: "jupiter", chainFamily: "solana", chainId: 20011000000n });
    expect(base?.chainFamily).toBe("eip155");
    expect(solana?.chainFamily).toBe("solana");
  });
});
