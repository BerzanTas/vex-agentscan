import { verifyMessage } from "viem";
import type { HandshakeProofVerificationInput, HandshakeProofVerifier } from "./proof-verifier.js";

export class EvmProofVerifier implements HandshakeProofVerifier {
  async verify(input: HandshakeProofVerificationInput): Promise<boolean> {
    try {
      return await verifyMessage({
        address: input.address as `0x${string}`,
        message: input.template,
        signature: input.signature as `0x${string}`,
      });
    } catch {
      return false;
    }
  }
}
