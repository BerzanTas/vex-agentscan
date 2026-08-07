import { describe, expect, it } from "vitest";
import { buildAttestationChainRegistry } from "../chain-registry/attestation-chain-registry.js";

describe("buildAttestationChainRegistry", () => {
  it("accepts the seeded trench chain even with no configured factory addresses", () => {
    const registry = buildAttestationChainRegistry(new Map());
    expect(registry.has(4663n)).toBe(true);
    expect(registry.get(4663n)).toEqual({ factoryAddresses: [] });
  });

  it("wires configured factory addresses onto the seeded chain", () => {
    const registry = buildAttestationChainRegistry(new Map([[4663n, ["0xfactory1", "0xfactory2"]]]));
    expect(registry.get(4663n)).toEqual({ factoryAddresses: ["0xfactory1", "0xfactory2"] });
  });

  it("rejects a chain id outside the seeded set regardless of configured addresses", () => {
    const registry = buildAttestationChainRegistry(new Map([[1n, ["0xfactory1"]]]));
    expect(registry.has(1n)).toBe(false);
  });
});
