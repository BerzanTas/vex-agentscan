import type pg from "pg";

export type AgentAwaitingPurge = { agentHash: string; revokedAt: Date; ageSeconds: number };

export async function listAgentsAwaitingPurge(pool: pg.Pool): Promise<AgentAwaitingPurge[]> {
  const result = await pool.query<{ agent_hash: string; revoked_at: Date; age_seconds: number }>(
    `SELECT agent_hash, revoked_at, EXTRACT(EPOCH FROM (now() - revoked_at))::float8 AS age_seconds
     FROM agents WHERE status = 'revoked' AND purged_at IS NULL ORDER BY revoked_at`,
  );
  return result.rows.map((row) => ({
    agentHash: row.agent_hash,
    revokedAt: row.revoked_at,
    ageSeconds: row.age_seconds,
  }));
}
