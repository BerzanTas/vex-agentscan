/**
 * WHICH CONTRACT, ON WHICH CHAIN, IS ALLOWED TO PROVE A TOKEN CREATION.
 *
 * The allowlist is the whole security of a token attestation: the signature proves who signed, and
 * this table proves that the creation event they point at came from a launchpad's real contract
 * rather than from one an attacker deployed to emit a look-alike log. It is therefore keyed by
 * (chain, launchpad) and never by chain alone - the pools.fun gateways and the Virtuals BondingV5
 * proxies both live on chain 4663, and a Virtuals claim must not be provable by a pools.fun
 * contract or the reverse.
 */

/**
 * Mirrors `LAUNCHPADS` in `@agentscan/contract`. `packages/core` does not depend on the contract
 * package (the same split that makes `VerificationKind` a hand-written mirror of `EVENT_KINDS`), so
 * `attestation-launchpad-vocabulary.test.ts` pins the two lists equal.
 */
export type AttestationLaunchpad = "trench" | "pools_fun" | "virtuals";

/**
 * How a launchpad proves that the signer created the token.
 *
 * `creation_event`: the receipt carries a creation log from an allowlisted contract, and that log
 * NAMES the creator. Trench's `TokenCreated(token, creator, ...)` and pools.fun's
 * `GatewayLaunch(token, pool, launcher, ...)` both do, so the proof is entirely inside the log and
 * whoever submitted the transaction is irrelevant.
 *
 * `creator_transaction`: the creation log does NOT name a creator, so the transaction envelope is
 * the proof. Virtuals' `PreLaunched(token, pair, virtualId, initialPurchase, launchParams)` carries
 * no creator field (`BondingV5.sol:137-151`), and its sibling `Launched` is emitted from the
 * KEEPER's transaction some seconds later - measured on Base, tx
 * 0x9eca4cb5...f720f99 sent by keeper 0x81f7ca6a..., not by the creator. Attributing a launch from
 * `Launched` would therefore credit the keeper for every Virtuals agent ever launched. The only
 * honest proof is the creator's OWN `preLaunch` transaction: `tx.from` is the signer, `tx.to` is an
 * allowlisted BondingV5, and the receipt holds `PreLaunched` for the attested token.
 */
export type AttestationProofMode = "creation_event" | "creator_transaction";

export const ATTESTATION_PROOF_MODES: Readonly<Record<AttestationLaunchpad, AttestationProofMode>> = {
  trench: "creation_event",
  pools_fun: "creation_event",
  virtuals: "creator_transaction",
};

export const ATTESTATION_CHAIN_IDS = [4663n, 8453n] as const;

/** The Trench Express token factory on Robinhood Chain. */
const TRENCH_TOKEN_FACTORY_ADDRESS = "0x3857c6c4fe93abb40945dfc8b9d690384cbae014";

/**
 * All three pools.fun launch gateways, measured on chain 4663 on 2026-09-04 (probe REPORT.md
 * section 4). Every generation stays allowlisted: V1 and V2 launched real tokens whose creators can
 * still attest them, and a suite that is no longer used by `launches/prepare` is not a suite whose
 * history stopped being true. The emitter of `GatewayLaunch` is the gateway, which is also the `to`
 * of the launch transaction.
 */
const POOLS_FUN_GATEWAY_ADDRESSES = [
  "0x3ab42e7dd316af8854033bc216c657ed34961164",
  "0xc5cf20c52b98bee5fa2440ed0d2cfbbe9a4c2fc0",
  "0x2bc81783ed0fdd8b04604ff93fa3872212cac429",
];

/**
 * The Virtuals BondingV5 proxies. Measured by closed-loop `eth_call` on 2026-09-04 and confirmed
 * against the two real launches of that day: Robinhood `preLaunch` tx
 * 0x7cc33439...cb374523 has `to` = the 4663 proxy, and the Base keeper `launch()` tx
 * 0x9eca4cb5...f720f99 has `to` = the 8453 proxy. The PROXY is allowlisted, never the
 * implementation behind it: the implementation is upgradeable and the address a transaction is sent
 * to is the proxy.
 */
const VIRTUALS_BONDING_V5_ROBINHOOD = "0xd4ccbfa37e2f35611b3042e4096ad7a3459bd007";
const VIRTUALS_BONDING_V5_BASE = "0x1a540088125d00dd3990f9da45ca0859af4d3b01";

export type LaunchpadAddressKey = { chainId: bigint; launchpad: AttestationLaunchpad };

function keyOf(chainId: bigint, launchpad: AttestationLaunchpad): string {
  return `${chainId.toString()}:${launchpad}`;
}

const DEFAULT_ADDRESSES: ReadonlyMap<string, readonly string[]> = new Map([
  [keyOf(4663n, "trench"), [TRENCH_TOKEN_FACTORY_ADDRESS]],
  [keyOf(4663n, "pools_fun"), POOLS_FUN_GATEWAY_ADDRESSES],
  [keyOf(4663n, "virtuals"), [VIRTUALS_BONDING_V5_ROBINHOOD]],
  [keyOf(8453n, "virtuals"), [VIRTUALS_BONDING_V5_BASE]],
]);

export type AttestationChainEntry = {
  /** Allowlisted addresses per launchpad. A launchpad absent from this map is not attestable here. */
  launchpads: ReadonlyMap<AttestationLaunchpad, readonly string[]>;
};
export type AttestationChainRegistry = ReadonlyMap<bigint, AttestationChainEntry>;

function addressesFor(
  chainId: bigint,
  launchpad: AttestationLaunchpad,
  overrides: ReadonlyMap<string, readonly string[]>,
): readonly string[] {
  const key = keyOf(chainId, launchpad);
  return overrides.get(key) ?? DEFAULT_ADDRESSES.get(key) ?? [];
}

/**
 * @param overrides deployment-supplied allowlists, keyed `<chainId>:<launchpad>`. An override
 *   REPLACES the built-in list for that pair rather than adding to it, so an operator can narrow an
 *   allowlist as well as widen it.
 */
export function buildAttestationChainRegistry(
  overrides: ReadonlyMap<string, readonly string[]>,
): AttestationChainRegistry {
  const registry = new Map<bigint, AttestationChainEntry>();
  for (const chainId of ATTESTATION_CHAIN_IDS) {
    const launchpads = new Map<AttestationLaunchpad, readonly string[]>();
    for (const launchpad of Object.keys(ATTESTATION_PROOF_MODES) as AttestationLaunchpad[]) {
      const addresses = [...addressesFor(chainId, launchpad, overrides)];
      if (addresses.length === 0) continue;
      launchpads.set(launchpad, addresses);
    }
    if (launchpads.size === 0) continue;
    registry.set(chainId, { launchpads });
  }
  return registry;
}

/** The allowlist for one claim, or an empty list when the chain does not host that launchpad. */
export function allowlistFor(
  registry: AttestationChainRegistry,
  key: LaunchpadAddressKey,
): readonly string[] {
  return registry.get(key.chainId)?.launchpads.get(key.launchpad) ?? [];
}

export function attestationLaunchpadSupported(
  registry: AttestationChainRegistry,
  key: LaunchpadAddressKey,
): boolean {
  return allowlistFor(registry, key).length > 0;
}
