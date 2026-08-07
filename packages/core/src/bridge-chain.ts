import type { ChainEntry } from "./chain-registry/chains.js";
import { resolveChain } from "./chain-registry/registry.js";

export function resolveBridgeChain(protocol: string, chainId: bigint): ChainEntry | null {
  const providerNativeEntry = resolveChain({ protocol, chainFamily: "solana", chainId });
  if (providerNativeEntry) return providerNativeEntry;
  return resolveChain({ protocol, chainFamily: "eip155", chainId });
}
