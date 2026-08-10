import type pg from "pg";

export async function findAgentsDueForPurge(pool: pg.Pool, purgeDelayH: number): Promise<string[]> {
  const result = await pool.query<{ agent_hash: string }>(
    `SELECT agent_hash FROM agents
     WHERE status = 'revoked' AND revoked_at <= now() - make_interval(hours => $1)
     ORDER BY revoked_at`,
    [purgeDelayH],
  );
  return result.rows.map((row) => row.agent_hash);
}

export async function purgeAgentData(pool: pg.Pool, agentHash: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const activities = await client.query("DELETE FROM activities WHERE agent_hash = $1", [agentHash]);
    const strikes = await client.query("DELETE FROM strikes WHERE agent_hash = $1", [agentHash]);
    const wallets = await client.query("DELETE FROM agent_wallets WHERE agent_hash = $1", [agentHash]);
    const stamped = await client.query(
      "UPDATE agents SET purged_at = now(), updated_at = now() WHERE agent_hash = $1 AND purged_at IS NULL",
      [agentHash],
    );
    await client.query("COMMIT");
    return (
      (activities.rowCount ?? 0) > 0 ||
      (strikes.rowCount ?? 0) > 0 ||
      (wallets.rowCount ?? 0) > 0 ||
      (stamped.rowCount ?? 0) > 0
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
