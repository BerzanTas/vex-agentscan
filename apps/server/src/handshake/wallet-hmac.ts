import { createHmac } from "node:crypto";
import type { ChainFamily } from "@agentscan/contract";

export function normalizeHandshakeAddress(chainFamily: ChainFamily, address: string): string {
  return chainFamily === "eip155" ? address.toLowerCase() : address;
}

export function addressHmacHex(pepper: string, chainFamily: ChainFamily, normalizedAddress: string): string {
  return createHmac("sha256", pepper).update(`${chainFamily}:${normalizedAddress}`).digest("hex");
}
