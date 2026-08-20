import { EVM_NATIVE_ADDRESS, isEvmNativeAddress } from "../evm-native-address.js";
import type { ChainFamily } from "../chain-registry/catalog.js";
import { resolveChain } from "../chain-registry/registry.js";

const evmAddressPattern = /^0x[0-9a-f]{40}$/;
const solanaMintPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export type CoinKeyQuery = {
  protocol: string;
  chainFamily: ChainFamily;
  chainId: bigint;
  tokenAddress: string;
};

export type CoinKeyResolution = { coinKey: string; tokenAddress: string };

function feedTokenAddress(chainFamily: ChainFamily, tokenAddress: string): string | null {
  if (chainFamily === "solana") return solanaMintPattern.test(tokenAddress) ? tokenAddress : null;
  const lowercased = tokenAddress.toLowerCase();
  if (!evmAddressPattern.test(lowercased)) return null;
  return isEvmNativeAddress(lowercased) ? EVM_NATIVE_ADDRESS : lowercased;
}

export function resolveCoinKey(query: CoinKeyQuery): CoinKeyResolution | null {
  const priceFeedKey = resolveChain(query)?.priceFeedKey;
  if (priceFeedKey === undefined) return null;
  const tokenAddress = feedTokenAddress(query.chainFamily, query.tokenAddress);
  if (tokenAddress === null) return null;
  return { coinKey: `${priceFeedKey}:${tokenAddress}`, tokenAddress };
}
