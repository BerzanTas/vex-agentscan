import type pg from "pg";
import type { AttestationVerifyStatus } from "@agentscan/core";

export type AttestSubmission = {
  chainId: bigint;
  tokenAddress: string;
  recoveredSigner: string;
  attestSignature: string;
  txHashHint: string | null;
  submitterIpHash: string;
};

export type AttestSubmissionLimits = { maxPendingPerIp: number; maxPendingGlobal: number };

export type AttestSubmissionOutcome =
  | { kind: "accepted"; verifyStatus: AttestationVerifyStatus }
  | { kind: "per_ip_cap_exceeded" }
  | { kind: "global_cap_exceeded" };

const PENDING_PREDICATE = "verify_status = 'unverified' AND revoked_at IS NULL";
const SUBMIT_LOCK_KEY = "token_attestations:submit";

async function existingRow(
  client: pg.PoolClient,
  submission: AttestSubmission,
): Promise<{ id: string; verifyStatus: AttestationVerifyStatus } | null> {
  const result = await client.query<{ id: string; verify_status: AttestationVerifyStatus }>(
    `SELECT id, verify_status FROM token_attestations
     WHERE chain_id = $1 AND token_address = $2 AND recovered_signer = $3
     FOR UPDATE`,
    [submission.chainId.toString(), submission.tokenAddress, submission.recoveredSigner],
  );
  const row = result.rows[0];
  return row === undefined ? null : { id: row.id, verifyStatus: row.verify_status };
}

async function refreshExistingRow(
  client: pg.PoolClient,
  existing: { id: string; verifyStatus: AttestationVerifyStatus },
  submission: AttestSubmission,
): Promise<AttestationVerifyStatus> {
  if (existing.verifyStatus !== "unverified") return existing.verifyStatus;
  const result = await client.query<{ verify_status: AttestationVerifyStatus }>(
    `UPDATE token_attestations SET
       tx_hash_hint = COALESCE(tx_hash_hint, $2)
     WHERE id = $1 AND verify_status = 'unverified'
     RETURNING verify_status`,
    [existing.id, submission.txHashHint],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("token attestation row vanished under lock");
  return row.verify_status;
}

async function pendingCountFor(client: pg.PoolClient, submitterIpHash?: string): Promise<number> {
  const result = await client.query<{ pending_count: string }>(
    submitterIpHash === undefined
      ? `SELECT COUNT(*)::text AS pending_count FROM token_attestations WHERE ${PENDING_PREDICATE}`
      : `SELECT COUNT(*)::text AS pending_count FROM token_attestations
         WHERE submitter_ip_hash = $1 AND ${PENDING_PREDICATE}`,
    submitterIpHash === undefined ? [] : [submitterIpHash],
  );
  return Number(result.rows[0]?.pending_count ?? "0");
}

async function insertRow(client: pg.PoolClient, submission: AttestSubmission): Promise<AttestationVerifyStatus> {
  const result = await client.query<{ verify_status: AttestationVerifyStatus }>(
    `INSERT INTO token_attestations
       (chain_id, token_address, recovered_signer, attest_signature, tx_hash_hint, submitter_ip_hash)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING verify_status`,
    [
      submission.chainId.toString(),
      submission.tokenAddress,
      submission.recoveredSigner,
      submission.attestSignature,
      submission.txHashHint,
      submission.submitterIpHash,
    ],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("token attestation insert returned no row");
  return row.verify_status;
}

export async function submitAttestation(
  client: pg.PoolClient,
  submission: AttestSubmission,
  limits: AttestSubmissionLimits,
): Promise<AttestSubmissionOutcome> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [SUBMIT_LOCK_KEY]);
  const existing = await existingRow(client, submission);
  if (existing !== null) {
    return { kind: "accepted", verifyStatus: await refreshExistingRow(client, existing, submission) };
  }
  const perIpPending = await pendingCountFor(client, submission.submitterIpHash);
  if (perIpPending >= limits.maxPendingPerIp) return { kind: "per_ip_cap_exceeded" };
  const globalPending = await pendingCountFor(client);
  if (globalPending >= limits.maxPendingGlobal) return { kind: "global_cap_exceeded" };
  return { kind: "accepted", verifyStatus: await insertRow(client, submission) };
}

export type AttestationCandidateRow = {
  recoveredSigner: string;
  verifyStatus: AttestationVerifyStatus;
  revokedAt: Date | null;
  firstSeenAt: Date;
  verifiedAt: Date | null;
  derivedTxHash: string | null;
  attestSignature: string;
};

const DISPLAY_STATUS_RANK_SQL = `CASE
       WHEN revoked_at IS NOT NULL THEN 3
       WHEN verify_status = 'verified' THEN 0
       WHEN verify_status = 'unverified' THEN 1
       ELSE 2
     END`;

export async function attestationCandidatesFor(
  pool: pg.Pool,
  chainId: bigint,
  tokenAddress: string,
  maxCandidates: number,
): Promise<AttestationCandidateRow[]> {
  const result = await pool.query<{
    recovered_signer: string;
    verify_status: AttestationVerifyStatus;
    revoked_at: Date | null;
    first_seen_at: Date;
    verified_at: Date | null;
    derived_tx_hash: string | null;
    attest_signature: string;
  }>(
    `SELECT recovered_signer, verify_status, revoked_at, first_seen_at, verified_at, derived_tx_hash, attest_signature
     FROM token_attestations
     WHERE chain_id = $1 AND token_address = $2
     ORDER BY ${DISPLAY_STATUS_RANK_SQL} ASC, first_seen_at ASC
     LIMIT $3`,
    [chainId.toString(), tokenAddress, maxCandidates],
  );
  return result.rows.map((row) => ({
    recoveredSigner: row.recovered_signer,
    verifyStatus: row.verify_status,
    revokedAt: row.revoked_at,
    firstSeenAt: row.first_seen_at,
    verifiedAt: row.verified_at,
    derivedTxHash: row.derived_tx_hash,
    attestSignature: row.attest_signature,
  }));
}
