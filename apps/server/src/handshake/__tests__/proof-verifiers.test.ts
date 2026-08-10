import { describe, expect, it } from "vitest";
import { EvmProofVerifier } from "../evm-proof-verifier.js";
import { proofVerifierFor } from "../proof-verifiers.js";
import { SolanaProofVerifier } from "../solana-proof-verifier.js";

describe("proofVerifierFor", () => {
  it("resolves eip155 to an EvmProofVerifier", () => {
    expect(proofVerifierFor("eip155")).toBeInstanceOf(EvmProofVerifier);
  });

  it("resolves solana to a SolanaProofVerifier", () => {
    expect(proofVerifierFor("solana")).toBeInstanceOf(SolanaProofVerifier);
  });
});
