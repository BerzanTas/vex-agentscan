import { describe, expect, it } from "vitest";
import { LAUNCHPADS, DEFAULT_LAUNCHPAD } from "@agentscan/contract";
import { ATTESTATION_PROOF_MODES, type AttestationLaunchpad } from "@agentscan/core";

/**
 * `packages/core` does not depend on `packages/contract`, so `AttestationLaunchpad` is a
 * hand-written mirror of the wire enum - the same split that makes `VerificationKind` a mirror of
 * `EVENT_KINDS`. This test is what keeps the two honest: a launchpad added to the wire without a
 * proof mode, or a proof mode for a launchpad no client can name, fails here rather than at runtime
 * on a claim nobody can verify.
 */
describe("the launchpad vocabulary across the contract and the core", () => {
  it("gives every wire launchpad exactly one proof mode, and names no others", () => {
    expect(Object.keys(ATTESTATION_PROOF_MODES).sort()).toEqual([...LAUNCHPADS].sort());
  });

  it("keeps the default launchpad inside the enum", () => {
    const vocabulary: readonly string[] = LAUNCHPADS;
    expect(vocabulary).toContain(DEFAULT_LAUNCHPAD);
  });

  it("types every wire launchpad as an AttestationLaunchpad", () => {
    const asCoreType: readonly AttestationLaunchpad[] = LAUNCHPADS;
    expect(asCoreType).toHaveLength(LAUNCHPADS.length);
  });
});
