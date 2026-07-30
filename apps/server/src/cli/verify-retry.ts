import type pg from "pg";

export async function retryVerification(pool: pg.Pool, publicId: string): Promise<{ requeued: boolean }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const requeued = await client.query<{ id: string }>(
      "UPDATE activities SET verification_state = 'queued' WHERE public_id = $1 RETURNING id",
      [publicId],
    );
    const activity = requeued.rows[0];
    if (activity === undefined) {
      await client.query("ROLLBACK");
      return { requeued: false };
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
