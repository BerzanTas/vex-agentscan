export const ATTESTATION_CHAIN_IDS = [4663n] as const;

export type AttestationChainEntry = { factoryAddresses: string[] };
export type AttestationChainRegistry = ReadonlyMap<bigint, AttestationChainEntry>;

export function buildAttestationChainRegistry(
  factoryAddressesByChainId: ReadonlyMap<bigint, readonly string[]>,
): AttestationChainRegistry {
  return new Map(
    ATTESTATION_CHAIN_IDS.map((chainId) => [
      chainId,
      { factoryAddresses: [...(factoryAddressesByChainId.get(chainId) ?? [])] },
    ]),
  );
}
