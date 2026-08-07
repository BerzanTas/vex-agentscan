export const ATTESTATION_CHAIN_IDS = [4663n] as const;

const TRENCH_TOKEN_FACTORY_ADDRESS = "0x3857c6c4fe93abb40945dfc8b9d690384cbae014";

const DEFAULT_FACTORY_ADDRESSES_BY_CHAIN_ID: ReadonlyMap<bigint, readonly string[]> = new Map([
  [4663n, [TRENCH_TOKEN_FACTORY_ADDRESS]],
]);

export type AttestationChainEntry = { factoryAddresses: string[] };
export type AttestationChainRegistry = ReadonlyMap<bigint, AttestationChainEntry>;

function factoryAddressesFor(
  chainId: bigint,
  factoryAddressesByChainId: ReadonlyMap<bigint, readonly string[]>,
): readonly string[] {
  return factoryAddressesByChainId.get(chainId) ?? DEFAULT_FACTORY_ADDRESSES_BY_CHAIN_ID.get(chainId) ?? [];
}

export function buildAttestationChainRegistry(
  factoryAddressesByChainId: ReadonlyMap<bigint, readonly string[]>,
): AttestationChainRegistry {
  const registry = new Map<bigint, AttestationChainEntry>();
  for (const chainId of ATTESTATION_CHAIN_IDS) {
    const factoryAddresses = [...factoryAddressesFor(chainId, factoryAddressesByChainId)];
    if (factoryAddresses.length === 0) continue;
    registry.set(chainId, { factoryAddresses });
  }
  return registry;
}
