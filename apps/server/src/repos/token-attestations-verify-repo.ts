import type pg from "pg";
import type { AttestationLaunchpad, AttestationMismatchDetail } from "@agentscan/core";

export type SqlExecutor = Pick<pg.PoolClient, "query">;

export type ClaimedAttestation = {
  id: string;
  chainId: bigint;
  /** The launchpad the submitter claimed. It selects the decoder AND the allowlist, never a guess. */
  launchpad: AttestationLaunchpad;
  tokenAddress: string;
  recoveredSigner: string;
  txHashHint: string | null;
  attemptCount: number;
  firstSeenAt: Date;
};

type ClaimedAttestationRow = {
  id: string;
  chain_id: string;
  launchpad: AttestationLaunchpad;
  token_address: string;
  recovered_signer: string;
  tx_hash_hint: string | null;
  attempt_count: number;
  first_seen_at: Date;
};

export async function claimDueAttestations(
  pool: pg.Pool,
  limit: number,
  leaseSec: number,
): Promise<ClaimedAttestation[]> {
  const result = await pool.query<ClaimedAttestationRow>(
    `UPDATE token_attestations
     SET next_attempt_at = now() + make_interval(secs => $2::float8)
     WHERE id IN (
       SELECT id FROM token_attestations
       WHERE verify_status = 'unverified' AND revoked_at IS NULL AND next_attempt_at <= now()
       ORDER BY next_attempt_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, chain_id, launchpad, token_address, recovered_signer, tx_hash_hint, attempt_count, first_seen_at`,
    [limit, leaseSec],
  );
  return result.rows.map((row) => ({
    id: row.id,
    chainId: BigInt(row.chain_id),
    launchpad: row.launchpad,
    tokenAddress: row.token_address,
    recoveredSigner: row.recovered_signer,
    txHashHint: row.tx_hash_hint,
    attemptCount: row.attempt_count,
    firstSeenAt: row.first_seen_at,
  }));
}

export async function rescheduleAttestation(client: SqlExecutor, id: string, delayMs: number): Promise<void> {
  await client.query(
    `UPDATE token_attestations
     SET attempt_count = attempt_count + 1,
         next_attempt_at = now() + make_interval(secs => $2::float8)
     WHERE id = $1`,
    [id, delayMs / 1000],
  );
}

export async function terminalizeUnverifiable(client: SqlExecutor, id: string): Promise<void> {
  await client.query(
    `UPDATE token_attestations
     SET verify_status = 'unverifiable', verify_detail = 'never_verified'
     WHERE id = $1 AND verify_status = 'unverified'`,
    [id],
  );
}

export type AttestationTerminalVerdict =
  | { result: "verified"; derivedTxHash: string }
  | { result: "mismatch"; detail: AttestationMismatchDetail };

export async function finalizeAttestation(
  client: SqlExecutor,
  id: string,
  verdict: AttestationTerminalVerdict,
): Promise<void> {
  if (verdict.result === "verified") {
    await client.query(
      `UPDATE token_attestations
       SET verify_status = 'verified', verified_at = now(), derived_tx_hash = $2
       WHERE id = $1 AND verify_status = 'unverified'`,
      [id, verdict.derivedTxHash],
    );
    return;
  }
  await client.query(
    `UPDATE token_attestations
     SET verify_status = 'mismatch', verify_detail = $2
     WHERE id = $1 AND verify_status = 'unverified'`,
    [id, verdict.detail],
  );
}

export async function revokeAttestations(
  pool: pg.Pool,
  chainId: bigint,
  tokenAddress: string,
  reason: string,
): Promise<number> {
  const result = await pool.query(
    `UPDATE token_attestations
     SET revoked_at = now(), revoke_reason = $3
     WHERE chain_id = $1 AND token_address = $2 AND revoked_at IS NULL`,
    [chainId.toString(), tokenAddress, reason],
  );
  return result.rowCount ?? 0;
}
