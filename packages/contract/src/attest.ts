import { z } from "zod";

const hexAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hexSignature = z.string().regex(/^0x[0-9a-fA-F]{130}$/);
const hexTxHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

export const attestRequestSchema = z.object({
  chainId: z.coerce.bigint().positive(),
  tokenAddress: hexAddress,
  attestSignature: hexSignature,
  txHash: hexTxHash.optional(),
});

export function canonicalAttestMessage(chainId: bigint, tokenAddress: string): string {
  return `VEX-attest:${chainId.toString()}:${tokenAddress.toLowerCase()}`;
}
