import { z } from "zod";
import { DEFAULT_LAUNCHPAD, LAUNCHPADS } from "./launchpad.js";

const hexAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hexSignature = z.string().regex(/^0x[0-9a-fA-F]{130}$/);
const hexTxHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

export const attestRequestSchema = z.object({
  chainId: z.coerce.bigint().positive(),
  /**
   * Which launchpad this token was created on, and therefore which creation proof the verifier
   * must apply. Optional on the wire and defaulted to `trench`, which is what every client that
   * predates this field means: reader-before-writer compatibility, not a lenient fallback for an
   * unknown value - an unrecognised launchpad is refused by the enum.
   */
  launchpad: z.enum(LAUNCHPADS).default(DEFAULT_LAUNCHPAD),
  tokenAddress: hexAddress,
  attestSignature: hexSignature,
  txHash: hexTxHash.optional(),
});

export function canonicalAttestMessage(chainId: bigint, tokenAddress: string): string {
  return `VEX-attest:${chainId.toString()}:${tokenAddress.toLowerCase()}`;
}
