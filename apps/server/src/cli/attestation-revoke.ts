import type pg from "pg";
import { revokeAttestations } from "../repos/token-attestations-verify-repo.js";

export type RevokeAttestationsOutcome = { revokedCount: number };

export async function revokeTokenAttestations(
  pool: pg.Pool,
  chainId: bigint,
  tokenAddress: string,
  reason: string,
): Promise<RevokeAttestationsOutcome> {
  const revokedCount = await revokeAttestations(pool, chainId, tokenAddress, reason);
  return { revokedCount };
}
