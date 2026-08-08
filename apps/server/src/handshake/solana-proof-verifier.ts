import bs58 from "bs58";
import nacl from "tweetnacl";
import type { HandshakeProofVerificationInput, HandshakeProofVerifier } from "./proof-verifier.js";
import { solanaOffchainMessageBytes } from "./solana-offchain-message.js";

const ED25519_PUBLIC_KEY_BYTES = 32;
const ED25519_SIGNATURE_BYTES = 64;

function decodeBase58(value: string): Uint8Array | null {
  try {
    return bs58.decode(value);
  } catch {
    return null;
  }
}

export class SolanaProofVerifier implements HandshakeProofVerifier {
  async verify(input: HandshakeProofVerificationInput): Promise<boolean> {
    const publicKey = decodeBase58(input.address);
    if (publicKey === null || publicKey.length !== ED25519_PUBLIC_KEY_BYTES) return false;
    const signature = decodeBase58(input.signature);
    if (signature === null || signature.length !== ED25519_SIGNATURE_BYTES) return false;
    const message = solanaOffchainMessageBytes(input.template);
    return nacl.sign.detached.verify(message, signature, publicKey);
  }
}
