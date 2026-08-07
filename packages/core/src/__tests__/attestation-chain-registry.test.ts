import { describe, expect, it } from "vitest";
import { buildAttestationChainRegistry } from "../chain-registry/attestation-chain-registry.js";

const trenchFactoryAddress = "0x3857c6c4fe93abb40945dfc8b9d690384cbae014";

describe("buildAttestationChainRegistry", () => {
  it("falls back to the code-default trench factory address when none are configured", () => {
    const registry = buildAttestationChainRegistry(new Map());
    expect(registry.has(4663n)).toBe(true);
    expect(registry.get(4663n)).toEqual({ factoryAddresses: [trenchFactoryAddress] });
  });

  it("lets a configured env override fully replace the code-default factory addresses", () => {
    const registry = buildAttestationChainRegistry(new Map([[4663n, ["0xfactory1", "0xfactory2"]]]));
    expect(registry.get(4663n)).toEqual({ factoryAddresses: ["0xfactory1", "0xfactory2"] });
  });

  it("rejects a chain id outside the seeded set regardless of configured addresses", () => {
    const registry = buildAttestationChainRegistry(new Map([[1n, ["0xfactory1"]]]));
    expect(registry.has(1n)).toBe(false);
  });
});
