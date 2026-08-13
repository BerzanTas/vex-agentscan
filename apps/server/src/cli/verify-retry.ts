import type pg from "pg";

export type RetryRefusal =
  | { requeued: false; refusal: "not_found" }
  | { requeued: false; refusal: "not_retryable"; state: string };

export type RetryVerificationOutcome = { requeued: true } | RetryRefusal;

async function explainRefusal(client: pg.PoolClient, publicId: string): Promise<RetryRefusal> {
  const found = await client.query<{ verification_state: string }>(
    "SELECT verification_state FROM activities WHERE public_id = $1",
    [publicId],
  );
  const activity = found.rows[0];
  if (activity === undefined) return { requeued: false, refusal: "not_found" };
  return { requeued: false, refusal: "not_retryable", state: activity.verification_state };
}

export async function retryVerification(pool: pg.Pool, publicId: string): Promise<RetryVerificationOutcome> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const requeued = await client.query<{ id: string }>(
      `UPDATE activities SET verification_state = 'queued'
       WHERE public_id = $1 AND verification_state = 'none'
       RETURNING id`,
      [publicId],
    );
    const activity = requeued.rows[0];
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
    await client.query("COMMIT");
    return { requeued: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
