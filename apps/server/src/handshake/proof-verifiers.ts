import type { ChainFamily } from "@agentscan/contract";
import { EvmProofVerifier } from "./evm-proof-verifier.js";
import type { HandshakeProofVerifier } from "./proof-verifier.js";
import { SolanaProofVerifier } from "./solana-proof-verifier.js";

const proofVerifiersByChainFamily: Record<ChainFamily, HandshakeProofVerifier> = {
  eip155: new EvmProofVerifier(),
  solana: new SolanaProofVerifier(),
};

export function proofVerifierFor(chainFamily: ChainFamily): HandshakeProofVerifier {
  return proofVerifiersByChainFamily[chainFamily];
}
