import { evmChains, solanaChains, type ChainEntry } from "./chains.js";

export type ChainKey = { protocol: string; chainFamily: "eip155" | "solana"; chainId: bigint };
export type ResolveChain = (key: ChainKey) => ChainEntry | null;

function providerNativeKey(protocol: string, chainId: bigint): string {
  return `${protocol}:${chainId}`;
}

const evmEntriesByChainId = new Map(evmChains.map((chain) => [chain.chainId, chain.entry]));
const solanaEntriesByProviderKey = new Map(
  solanaChains.map((chain) => [providerNativeKey(chain.protocol, chain.chainId), chain.entry]),
);

export function resolveChain(key: ChainKey): ChainEntry | null {
  if (key.chainFamily === "eip155") return evmEntriesByChainId.get(key.chainId) ?? null;
  return solanaEntriesByProviderKey.get(providerNativeKey(key.protocol, key.chainId)) ?? null;
}
