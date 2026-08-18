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

  it("resolves the morpho lending chains Vex reports on to full-tier entries", () => {
    const morphoChainIds = [1n, 10n, 130n, 137n, 143n, 999n, 4663n, 8453n, 42161n];

    for (const chainId of morphoChainIds) {
      const entry = resolveChain({ protocol: "morpho", chainFamily: "eip155", chainId });

      expect(entry?.verificationTier).toBe("full");
      expect(entry?.priceFeedKey).toBeDefined();
    }
  });

  it("resolves Unichain, Monad and HyperEVM to their own slugs and explorers", () => {
    const unichain = resolveChain({ protocol: "morpho", chainFamily: "eip155", chainId: 130n });
    const monad = resolveChain({ protocol: "morpho", chainFamily: "eip155", chainId: 143n });
    const hyperevm = resolveChain({ protocol: "morpho", chainFamily: "eip155", chainId: 999n });

    expect(unichain?.canonicalSlug).toBe("unichain");
    expect(unichain?.explorerTxUrl("0xabc")).toBe("https://uniscan.xyz/tx/0xabc");
    expect(monad?.canonicalSlug).toBe("monad");
    expect(monad?.explorerTxUrl("0xabc")).toBe("https://monadvision.com/tx/0xabc");
    expect(hyperevm?.canonicalSlug).toBe("hyperevm");
    expect(hyperevm?.explorerTxUrl("0xabc")).toBe("https://hyperevmscan.io/tx/0xabc");
  });

  it("carries the chain family on every resolved entry", () => {
    const base = resolveChain({ protocol: "kyberswap", chainFamily: "eip155", chainId: 8453n });
    const solana = resolveChain({ protocol: "jupiter", chainFamily: "solana", chainId: 20011000000n });
    expect(base?.chainFamily).toBe("eip155");
    expect(solana?.chainFamily).toBe("solana");
  });
});

describe("the swap and bridge chains beyond the lending set", () => {
  const registered = [
    { chainId: 56n, canonicalSlug: "bsc", explorerTxUrl: "https://bscscan.com/tx/0xabc" },
    { chainId: 43114n, canonicalSlug: "avalanche", explorerTxUrl: "https://snowtrace.io/tx/0xabc" },
    { chainId: 59144n, canonicalSlug: "linea", explorerTxUrl: "https://lineascan.build/tx/0xabc" },
    { chainId: 5000n, canonicalSlug: "mantle", explorerTxUrl: "https://mantlescan.xyz/tx/0xabc" },
    { chainId: 80094n, canonicalSlug: "berachain", explorerTxUrl: "https://berascan.com/tx/0xabc" },
    { chainId: 146n, canonicalSlug: "sonic", explorerTxUrl: "https://sonicscan.org/tx/0xabc" },
    { chainId: 9745n, canonicalSlug: "plasma", explorerTxUrl: "https://plasmascan.to/tx/0xabc" },
    { chainId: 2020n, canonicalSlug: "ronin", explorerTxUrl: "https://explorer.roninchain.com/tx/0xabc" },
    { chainId: 4326n, canonicalSlug: "megaeth", explorerTxUrl: "https://megaeth.blockscout.com/tx/0xabc" },
  ];

  it.each(registered)(
    "resolves chain $chainId to $canonicalSlug at full tier with its explorer",
    ({ chainId, canonicalSlug, explorerTxUrl }) => {
      const entry = resolveChain({ protocol: "kyberswap", chainFamily: "eip155", chainId });

      expect(entry?.canonicalSlug).toBe(canonicalSlug);
      expect(entry?.verificationTier).toBe("full");
      expect(entry?.explorerTxUrl("0xabc")).toBe(explorerTxUrl);
    },
  );

  it.each(registered)("resolves chain $chainId for a bridge as well as a swap", ({ chainId, canonicalSlug }) => {
    const bridged = resolveChain({ protocol: "relay", chainFamily: "eip155", chainId });

    expect(bridged?.canonicalSlug).toBe(canonicalSlug);
  });

  it.each(registered)("dials only https rpc endpoints for chain $chainId", ({ chainId }) => {
    const entry = resolveChain({ protocol: "kyberswap", chainFamily: "eip155", chainId });

    expect(entry?.rpcUrls.length).toBeGreaterThan(0);
    for (const url of entry?.rpcUrls ?? []) expect(url.startsWith("https://")).toBe(true);
  });
});
