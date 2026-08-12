import { evmChains, solanaChains, type ChainEntry, type ChainFamily } from "./chains.js";

export type { ChainFamily };

export type ChainKeyForSlug = { chainFamily: ChainFamily; chainId: bigint; protocol: string | null };

export type CatalogChain = {
  canonicalSlug: string;
  displayName: string;
  verificationTier: ChainEntry["verificationTier"];
};

export function chainCatalog(): CatalogChain[] {
  const bySlug = new Map<string, CatalogChain>();
  for (const { entry } of [...evmChains, ...solanaChains]) {
    if (bySlug.has(entry.canonicalSlug)) continue;
    bySlug.set(entry.canonicalSlug, {
      canonicalSlug: entry.canonicalSlug,
      displayName: entry.displayName,
      verificationTier: entry.verificationTier,
    });
  }
  return [...bySlug.values()];
}

export function chainKeysForSlug(canonicalSlug: string): ChainKeyForSlug[] {
  const evmKeys = evmChains
    .filter(({ entry }) => entry.canonicalSlug === canonicalSlug)
    .map(({ chainId }) => ({ chainFamily: "eip155" as const, chainId, protocol: null }));
  const solanaKeys = solanaChains
    .filter(({ entry }) => entry.canonicalSlug === canonicalSlug)
    .map(({ chainId, protocol }) => ({ chainFamily: "solana" as const, chainId, protocol }));
  return [...evmKeys, ...solanaKeys];
}
