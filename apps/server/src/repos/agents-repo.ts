import type pg from "pg";

export type AgentRegistration = {
  agentHash: string;
  ingestTokenSha256: string;
  consentVersion: number;
  acceptedAt: string;
  appVersion: string | null;
};

export type RegisterOutcome = "registered" | "token_conflict";

export async function upsertAgentRegistration(
  pool: pg.Pool,
  registration: AgentRegistration,
): Promise<RegisterOutcome> {
  await pool.query(
    `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, app_version)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (agent_hash) DO UPDATE SET
       consent_version = GREATEST(agents.consent_version, EXCLUDED.consent_version),
       accepted_at = EXCLUDED.accepted_at,
       app_version = EXCLUDED.app_version,
       status = 'active',
       revoked_at = NULL,
       updated_at = now()
     WHERE agents.ingest_token_sha256 = EXCLUDED.ingest_token_sha256`,
    [
      registration.agentHash,
      registration.ingestTokenSha256,
      registration.consentVersion,
      registration.acceptedAt,
      registration.appVersion,
    ],
  );
  const stored = await pool.query<{ ingest_token_sha256: string }>(
    "SELECT ingest_token_sha256 FROM agents WHERE agent_hash = $1",
    [registration.agentHash],
  );
  const storedTokenSha256 = stored.rows[0]?.ingest_token_sha256;
  return storedTokenSha256 === registration.ingestTokenSha256 ? "registered" : "token_conflict";
}

export async function revokeAgent(pool: pg.Pool, agentHash: string): Promise<void> {
  await pool.query(
    `UPDATE agents SET status = 'revoked', revoked_at = now(), updated_at = now()
     WHERE agent_hash = $1 AND status <> 'revoked'`,
    [agentHash],
  );
}
