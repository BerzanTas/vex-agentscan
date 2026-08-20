import type pg from "pg";

export type ReopenRefusal =
  | { reopened: false; refusal: "not_found" }
  | { reopened: false; refusal: "not_reopenable"; state: string; status: string };

export type ReopenVerificationOutcome =
  | { reopened: true; strikesWithdrawn: number; quarantineLifted: boolean }
  | ReopenRefusal;

async function explainRefusal(client: pg.PoolClient, publicId: string): Promise<ReopenRefusal> {
  const found = await client.query<{ verification_state: string; status: string }>(
    "SELECT verification_state, status FROM activities WHERE public_id = $1",
    [publicId],
  );
  const activity = found.rows[0];
  if (activity === undefined) return { reopened: false, refusal: "not_found" };
  return {
    reopened: false,
    refusal: "not_reopenable",
    state: activity.verification_state,
    status: activity.status,
  };
}

async function restoreAgentStanding(
  client: pg.PoolClient,
  agentHash: string,
  strikesWithdrawn: number,
  quarantineStrikes: number,
): Promise<boolean> {
  if (strikesWithdrawn === 0) return false;
  const counted = await client.query<{ strike_count: number; status: string }>(
    `UPDATE agents SET strike_count = GREATEST(strike_count - $2, 0), updated_at = now()
     WHERE agent_hash = $1 RETURNING strike_count, status`,
    [agentHash, strikesWithdrawn],
  );
  const agent = counted.rows[0];
  if (agent === undefined) return false;
  if (agent.status !== "quarantined" || agent.strike_count >= quarantineStrikes) return false;
  await client.query(
    "UPDATE agents SET status = 'active', quarantined_at = NULL, updated_at = now() WHERE agent_hash = $1",
    [agentHash],
  );
  return true;
}

export async function reopenVerification(
  pool: pg.Pool,
  publicId: string,
  quarantineStrikes: number,
): Promise<ReopenVerificationOutcome> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reopened = await client.query<{ id: string; agent_hash: string }>(
      `UPDATE activities SET verification_state = 'queued'
       WHERE public_id = $1 AND verification_state = 'mismatch' AND status = 'confirmed' AND tx_hash IS NOT NULL
       RETURNING id, agent_hash`,
      [publicId],
    );
    const activity = reopened.rows[0];
    if (activity === undefined) {
      await client.query("ROLLBACK");
      return await explainRefusal(client, publicId);
    }
    await client.query(
      `INSERT INTO verification_jobs (activity_id, attempts, first_attempt_at, next_attempt_at)
       VALUES ($1, 0, now(), now())
       ON CONFLICT (activity_id)
       DO UPDATE SET attempts = 0, first_attempt_at = now(), next_attempt_at = now(), last_error = NULL`,
      [activity.id],
    );
    const withdrawn = await client.query("DELETE FROM strikes WHERE activity_id = $1", [activity.id]);
    const strikesWithdrawn = withdrawn.rowCount ?? 0;
    const quarantineLifted = await restoreAgentStanding(
      client,
      activity.agent_hash,
      strikesWithdrawn,
      quarantineStrikes,
    );
    await client.query("INSERT INTO strikes (agent_hash, reason) VALUES ($1, 'operator_reopen')", [
      activity.agent_hash,
    ]);
    await client.query("COMMIT");
    return { reopened: true, strikesWithdrawn, quarantineLifted };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
