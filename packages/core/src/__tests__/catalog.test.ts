import { describe, expect, it } from "vitest";
import { chainCatalog, chainKeysForSlug } from "../chain-registry/catalog.js";

describe("chainCatalog", () => {
  it("lists every canonical slug exactly once even though solana appears under two protocols", () => {
    const slugs = chainCatalog().map((chain) => chain.canonicalSlug);

    expect(slugs).toEqual([...new Set(slugs)]);
    expect(slugs).toContain("solana");
  });

  it("carries the display name and verification tier from the registry", () => {
    const catalog = chainCatalog();

    expect(catalog.find((chain) => chain.canonicalSlug === "base")).toEqual({
      canonicalSlug: "base",
      displayName: "Base",
      verificationTier: "full",
    });
    expect(catalog.find((chain) => chain.canonicalSlug === "solana")?.verificationTier).toBe("basic");
  });
});

describe("chainKeysForSlug", () => {
  it("maps an evm slug to a single key without a protocol", () => {
    expect(chainKeysForSlug("base")).toEqual([
      { chainFamily: "eip155", chainId: 8453n, protocol: null },
    ]);
  });

  it("maps solana to every provider-native key with its protocol", () => {
    expect(chainKeysForSlug("solana")).toEqual([
      { chainFamily: "solana", chainId: 20011000000n, protocol: "khalani" },
      { chainFamily: "solana", chainId: 792703809n, protocol: "relay" },
      { chainFamily: "solana", chainId: 20011000000n, protocol: "jupiter" },
    ]);
  });

  it("maps each newly registered morpho chain to its single evm key", () => {
    expect(chainKeysForSlug("unichain")).toEqual([
      { chainFamily: "eip155", chainId: 130n, protocol: null },
    ]);
    expect(chainKeysForSlug("monad")).toEqual([
      { chainFamily: "eip155", chainId: 143n, protocol: null },
    ]);
    expect(chainKeysForSlug("hyperevm")).toEqual([
      { chainFamily: "eip155", chainId: 999n, protocol: null },
    ]);
  });

  it("returns nothing for a slug outside the registry", () => {
    expect(chainKeysForSlug("bitcoin")).toEqual([]);
  });
});
