import { describe, expect, it } from "vitest";
import {
  ATTESTATION_CHAIN_IDS,
  ATTESTATION_PROOF_MODES,
  allowlistFor,
  attestationLaunchpadSupported,
  buildAttestationChainRegistry,
} from "../chain-registry/attestation-chain-registry.js";

const TRENCH_FACTORY = "0x3857c6c4fe93abb40945dfc8b9d690384cbae014";
const POOLS_V3_GATEWAY = "0x2bc81783ed0fdd8b04604ff93fa3872212cac429";
const VIRTUALS_BONDING_V5_BASE = "0x1a540088125d00dd3990f9da45ca0859af4d3b01";
const VIRTUALS_BONDING_V5_ROBINHOOD = "0xd4ccbfa37e2f35611b3042e4096ad7a3459bd007";

describe("buildAttestationChainRegistry", () => {
  const registry = buildAttestationChainRegistry(new Map());

  it("carries the trench factory on Robinhood Chain", () => {
    expect(allowlistFor(registry, { chainId: 4663n, launchpad: "trench" })).toEqual([TRENCH_FACTORY]);
  });

  // All three suites stay allowlisted: V1 and V2 launched real tokens whose creators can still
  // attest them, and a suite `launches/prepare` no longer uses is not a suite whose history stopped
  // being true.
  it("carries all three pools.fun gateway generations on Robinhood Chain", () => {
    const gateways = allowlistFor(registry, { chainId: 4663n, launchpad: "pools_fun" });
    expect(gateways).toHaveLength(3);
    expect(gateways).toContain(POOLS_V3_GATEWAY);
  });

  it("carries the Virtuals BondingV5 proxy on both of its chains, and only its own", () => {
    expect(allowlistFor(registry, { chainId: 8453n, launchpad: "virtuals" })).toEqual([
      VIRTUALS_BONDING_V5_BASE,
    ]);
    expect(allowlistFor(registry, { chainId: 4663n, launchpad: "virtuals" })).toEqual([
      VIRTUALS_BONDING_V5_ROBINHOOD,
    ]);
  });

  // THE POINT OF KEYING BY THE PAIR. pools.fun and Virtuals both live on chain 4663; a Virtuals
  // claim that a pools.fun gateway could satisfy would be no allowlist at all.
  it("keeps each launchpad's allowlist disjoint from its neighbours on the same chain", () => {
    const pools = allowlistFor(registry, { chainId: 4663n, launchpad: "pools_fun" });
    const virtuals = allowlistFor(registry, { chainId: 4663n, launchpad: "virtuals" });
    const trench = allowlistFor(registry, { chainId: 4663n, launchpad: "trench" });
    expect(pools.filter((address) => virtuals.includes(address) || trench.includes(address))).toEqual([]);
  });

  it("hosts no trench or pools.fun launchpad on Base", () => {
    expect(attestationLaunchpadSupported(registry, { chainId: 8453n, launchpad: "trench" })).toBe(false);
    expect(attestationLaunchpadSupported(registry, { chainId: 8453n, launchpad: "pools_fun" })).toBe(false);
  });

  it("lets a configured override fully replace one pair's allowlist and leave its neighbours alone", () => {
    const overridden = buildAttestationChainRegistry(
      new Map([["4663:pools_fun", ["0xgateway1", "0xgateway2"]]]),
    );
    expect(allowlistFor(overridden, { chainId: 4663n, launchpad: "pools_fun" })).toEqual([
      "0xgateway1",
      "0xgateway2",
    ]);
    expect(allowlistFor(overridden, { chainId: 4663n, launchpad: "trench" })).toEqual([TRENCH_FACTORY]);
  });

  it("lets an override narrow a pair to nothing, removing it from the registry", () => {
    const narrowed = buildAttestationChainRegistry(new Map([["4663:trench", []]]));
    expect(attestationLaunchpadSupported(narrowed, { chainId: 4663n, launchpad: "trench" })).toBe(false);
    expect(attestationLaunchpadSupported(narrowed, { chainId: 4663n, launchpad: "pools_fun" })).toBe(true);
  });

  it("rejects a chain id outside the seeded set regardless of configured addresses", () => {
    const registryWithStranger = buildAttestationChainRegistry(new Map([["1:trench", ["0xfactory1"]]]));
    expect(registryWithStranger.has(1n)).toBe(false);
  });

  it("seeds exactly the chains the arc measured", () => {
    expect([...ATTESTATION_CHAIN_IDS]).toEqual([4663n, 8453n]);
  });
});

describe("the proof mode each launchpad is verified by", () => {
  // Virtuals is the odd one out ON PURPOSE: `PreLaunched` names no creator, and its sibling
  // `Launched` is emitted from the KEEPER's transaction, so a creation-event proof would credit the
  // keeper for every agent ever launched.
  it("proves Virtuals from the creator's own transaction and the others from their creation event", () => {
    expect(ATTESTATION_PROOF_MODES).toEqual({
      trench: "creation_event",
      pools_fun: "creation_event",
      virtuals: "creator_transaction",
    });
  });
});
