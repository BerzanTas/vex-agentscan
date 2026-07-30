import type pg from "pg";

export type QuarantinedAgent = { agentHash: string; strikeCount: number; quarantinedAt: Date | null };

export async function listQuarantinedAgents(pool: pg.Pool): Promise<QuarantinedAgent[]> {
  const result = await pool.query<{ agent_hash: string; strike_count: number; quarantined_at: Date | null }>(
    `SELECT agent_hash, strike_count, quarantined_at FROM agents
     WHERE status = 'quarantined' ORDER BY quarantined_at`,
  );
  return result.rows.map((row) => ({
    agentHash: row.agent_hash,
    strikeCount: row.strike_count,
    quarantinedAt: row.quarantined_at,
  }));
}

export async function liftQuarantine(pool: pg.Pool, agentHash: string): Promise<{ lifted: boolean }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lifted = await client.query(
      `UPDATE agents SET status = 'active', strike_count = 0, quarantined_at = NULL, updated_at = now()
       WHERE agent_hash = $1 AND status = 'quarantined'`,
      [agentHash],
    );
    if ((lifted.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return { lifted: false };
    }
    await client.query("INSERT INTO strikes (agent_hash, reason) VALUES ($1, 'operator_lift')", [agentHash]);
    await client.query("COMMIT");
    return { lifted: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
