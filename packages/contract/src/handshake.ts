import { z } from "zod";
import type { ChainFamily } from "./enums.js";

const MAX_ADDRESSES_PER_HANDSHAKE = 6;
const MAX_ADDRESSES_PER_CHAIN_FAMILY = 3;

const evmAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const evmSignature = z.string().regex(/^0x[0-9a-fA-F]{130}$/);
const solanaAddress = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
const solanaSignature = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,96}$/);
const agentHash = z.string().regex(/^[0-9a-f]{64}$/);

const evmAddressEntrySchema = z.object({ chainFamily: z.literal("eip155"), address: evmAddress });
const solanaAddressEntrySchema = z.object({ chainFamily: z.literal("solana"), address: solanaAddress });

export const handshakeAddressEntrySchema = z.discriminatedUnion("chainFamily", [
  evmAddressEntrySchema,
  solanaAddressEntrySchema,
]);
export type HandshakeAddressEntry = z.infer<typeof handshakeAddressEntrySchema>;

function normalizedAddressKey(entry: HandshakeAddressEntry): string {
  const normalizedAddress = entry.chainFamily === "eip155" ? entry.address.toLowerCase() : entry.address;
  return `${entry.chainFamily}:${normalizedAddress}`;
}

function withinPerFamilyCap(addresses: HandshakeAddressEntry[]): boolean {
  const countByFamily = new Map<string, number>();
  for (const entry of addresses) {
    countByFamily.set(entry.chainFamily, (countByFamily.get(entry.chainFamily) ?? 0) + 1);
  }
  return [...countByFamily.values()].every((count) => count <= MAX_ADDRESSES_PER_CHAIN_FAMILY);
}

function hasNoDuplicateAddresses(addresses: HandshakeAddressEntry[]): boolean {
  const keys = addresses.map(normalizedAddressKey);
  return new Set(keys).size === keys.length;
}

export const handshakeSessionStartRequestSchema = z
  .object({
    agentHash,
    addresses: z.array(handshakeAddressEntrySchema).min(1).max(MAX_ADDRESSES_PER_HANDSHAKE),
  })
  .refine((body) => withinPerFamilyCap(body.addresses), "at most 3 addresses per chain family")
  .refine((body) => hasNoDuplicateAddresses(body.addresses), "duplicate address in addresses");
export type HandshakeSessionStartRequest = z.infer<typeof handshakeSessionStartRequestSchema>;

const evmProofSchema = z.object({
  chainFamily: z.literal("eip155"),
  address: evmAddress,
  signature: evmSignature,
  issuedAt: z.iso.datetime(),
});
const solanaProofSchema = z.object({
  chainFamily: z.literal("solana"),
  address: solanaAddress,
  signature: solanaSignature,
  issuedAt: z.iso.datetime(),
});

export const handshakeProofSchema = z.discriminatedUnion("chainFamily", [evmProofSchema, solanaProofSchema]);
export type HandshakeProof = z.infer<typeof handshakeProofSchema>;

export const handshakeSessionCompleteRequestSchema = z.object({
  challengeId: z.uuid(),
  agentHash,
  consentVersion: z.number().int().min(1),
  appVersion: z.string().max(32).optional(),
  proofs: z.array(handshakeProofSchema).min(1).max(MAX_ADDRESSES_PER_HANDSHAKE),
});
export type HandshakeSessionCompleteRequest = z.infer<typeof handshakeSessionCompleteRequestSchema>;

export function handshakeChallengeTemplate(input: {
  domain: string;
  agentHash: string;
  address: string;
  chainFamily: ChainFamily;
  nonce: string;
  issuedAt: string;
}): string {
  return [
    "AgentScan Handshake v1",
    `Domain: ${input.domain}`,
    `Agent: ${input.agentHash}`,
    `Address: ${input.address}`,
    `Chain-Family: ${input.chainFamily}`,
    `Nonce: ${input.nonce}`,
    `Issued-At: ${input.issuedAt}`,
  ].join("\n");
}
