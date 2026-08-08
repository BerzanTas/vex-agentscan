import type { ChainFamily } from "@agentscan/contract";
import type pg from "pg";
import { agentNameCandidates } from "../handshake/agent-name.js";

const UNIQUE_VIOLATION = "23505";
const CHALLENGE_RETENTION_INTERVAL = "1 hour";

export type NewChallenge = {
  agentHash: string;
  nonce: string;
  domain: string;
  addressHmacs: string[];
  expiresAt: Date;
};

export async function insertChallenge(pool: pg.Pool, challenge: NewChallenge): Promise<{ id: string }> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO handshake_challenges (agent_hash, nonce, domain, address_hmacs, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [challenge.agentHash, challenge.nonce, challenge.domain, challenge.addressHmacs, challenge.expiresAt],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("handshake challenge insert returned no row");
  return row;
}

export type ClaimedChallenge = {
  domain: string;
  nonce: string;
  addressHmacs: string[];
  createdAt: Date;
  expiresAt: Date;
};

export type ChallengeClaimOutcome = { kind: "invalid" } | { kind: "claimed"; challenge: ClaimedChallenge };

type ChallengeLockRow = {
  domain: string;
  nonce: string;
  address_hmacs: string[];
  agent_hash: string;
  created_at: Date;
  expires_at: Date;
  already_used: boolean;
  expired: boolean;
};

export async function claimChallenge(
  pool: pg.Pool,
  challengeId: string,
  requestAgentHash: string,
): Promise<ChallengeClaimOutcome> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<ChallengeLockRow>(
      `SELECT domain, nonce, address_hmacs, agent_hash, created_at, expires_at,
              used_at IS NOT NULL AS already_used, expires_at < now() AS expired
       FROM handshake_challenges
       WHERE id = $1
       FOR UPDATE`,
      [challengeId],
    );
    const row = locked.rows[0];
    if (row === undefined) {
      await client.query("COMMIT");
      return { kind: "invalid" };
    }
    if (!row.already_used) {
      await client.query("UPDATE handshake_challenges SET used_at = now() WHERE id = $1", [challengeId]);
    }
    await client.query("COMMIT");
    const invalid = row.already_used || row.expired || row.agent_hash !== requestAgentHash;
    if (invalid) return { kind: "invalid" };
    return {
      kind: "claimed",
      challenge: {
        domain: row.domain,
        nonce: row.nonce,
        addressHmacs: row.address_hmacs,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      },
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export type HandshakeWalletBinding = {
  chainFamily: ChainFamily;
  addressHmac: string;
  proofSignature: string;
};

export type HandshakeBindingRequest = {
  agentHash: string;
  consentVersion: number;
  appVersion: string | null;
  ingestTokenSha256: string;
  wallets: HandshakeWalletBinding[];
};

export type HandshakeBindOutcome = { kind: "bound"; agentName: string } | { kind: "wallet_conflict" };

async function upsertAgentForHandshake(
  client: pg.PoolClient,
  request: HandshakeBindingRequest,
): Promise<string | null> {
  const result = await client.query<{ name: string | null }>(
    `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, app_version, status, last_handshake_at)
     VALUES ($1, $2, $3, now(), $4, 'active', now())
     ON CONFLICT (agent_hash) DO UPDATE SET
       ingest_token_sha256 = EXCLUDED.ingest_token_sha256,
       consent_version = GREATEST(agents.consent_version, EXCLUDED.consent_version),
       app_version = EXCLUDED.app_version,
       status = 'active',
       revoked_at = NULL,
       last_handshake_at = now(),
       updated_at = now()
     RETURNING name`,
    [request.agentHash, request.ingestTokenSha256, request.consentVersion, request.appVersion],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("agent upsert returned no row");
  return row.name;
}

const ASSIGN_AGENT_NAME_SAVEPOINT = "assign_agent_name";

async function assignAgentName(client: pg.PoolClient, agentHash: string): Promise<string> {
  for (const candidate of agentNameCandidates(agentHash)) {
    await client.query(`SAVEPOINT ${ASSIGN_AGENT_NAME_SAVEPOINT}`);
    try {
      await client.query("UPDATE agents SET name = $1 WHERE agent_hash = $2", [candidate, agentHash]);
      await client.query(`RELEASE SAVEPOINT ${ASSIGN_AGENT_NAME_SAVEPOINT}`);
      return candidate;
    } catch (error) {
      if ((error as { code?: string }).code !== UNIQUE_VIOLATION) throw error;
      await client.query(`ROLLBACK TO SAVEPOINT ${ASSIGN_AGENT_NAME_SAVEPOINT}`);
    }
  }
  throw new Error(`could not assign a unique agent name for ${agentHash}`);
}

type WalletClaimOutcome = "bound" | "conflict";

async function claimWallet(
  client: pg.PoolClient,
  agentHash: string,
  wallet: HandshakeWalletBinding,
): Promise<WalletClaimOutcome> {
  const existing = await client.query<{ agent_hash: string }>(
    "SELECT agent_hash FROM agent_wallets WHERE chain_family = $1 AND address_hmac = $2 FOR UPDATE",
    [wallet.chainFamily, wallet.addressHmac],
  );
  const row = existing.rows[0];
  if (row !== undefined && row.agent_hash !== agentHash) return "conflict";
  if (row !== undefined) {
    await client.query(
      "UPDATE agent_wallets SET proof_signature = $3, proven_at = now() WHERE chain_family = $1 AND address_hmac = $2",
      [wallet.chainFamily, wallet.addressHmac, wallet.proofSignature],
    );
    return "bound";
  }
  await client.query(
    "INSERT INTO agent_wallets (agent_hash, chain_family, address_hmac, proof_signature) VALUES ($1, $2, $3, $4)",
    [agentHash, wallet.chainFamily, wallet.addressHmac, wallet.proofSignature],
  );
  return "bound";
}

export async function completeHandshakeBinding(
  client: pg.PoolClient,
  request: HandshakeBindingRequest,
): Promise<HandshakeBindOutcome> {
  const existingName = await upsertAgentForHandshake(client, request);
  for (const wallet of request.wallets) {
    const outcome = await claimWallet(client, request.agentHash, wallet);
    if (outcome === "conflict") return { kind: "wallet_conflict" };
  }
  const agentName = existingName ?? (await assignAgentName(client, request.agentHash));
  return { kind: "bound", agentName };
}

export async function lastAcceptedRowIdFor(pool: pg.Pool, agentHash: string): Promise<string | null> {
  const result = await pool.query<{ source_row_id: string }>(
    `SELECT source_row_id FROM activities
     WHERE agent_hash = $1 AND source_row_id ~ '^[0-9]+$'
     ORDER BY source_row_id::numeric DESC
     LIMIT 1`,
    [agentHash],
  );
  return result.rows[0]?.source_row_id ?? null;
}

export async function existingAgentTokenSha256(pool: pg.Pool, agentHash: string): Promise<string | null> {
  const result = await pool.query<{ ingest_token_sha256: string }>(
    "SELECT ingest_token_sha256 FROM agents WHERE agent_hash = $1",
    [agentHash],
  );
  return result.rows[0]?.ingest_token_sha256 ?? null;
}

export async function deleteExpiredHandshakeChallenges(pool: pg.Pool): Promise<number> {
  const result = await pool.query(
    `DELETE FROM handshake_challenges WHERE created_at < now() - interval '${CHALLENGE_RETENTION_INTERVAL}'`,
  );
  return result.rowCount ?? 0;
}
