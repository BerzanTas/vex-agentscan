import type pg from "pg";
import {
  decideSlidingWindow,
  type RateLimitDecision,
  type RateLimiter,
} from "../plugins/rate-limit.js";

export class PostgresSlidingWindowLimiter implements RateLimiter {
  private readonly pool: pg.Pool;
  private readonly limit: number;
  private readonly windowSec: number;

  constructor(pool: pg.Pool, limit: number, windowSec: number) {
    this.pool = pool;
    this.limit = limit;
    this.windowSec = windowSec;
  }

  async allow(key: string): Promise<RateLimitDecision> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{ hits: Date[] }>(
        "SELECT hits FROM rate_limit_hits WHERE key_hash = $1 FOR UPDATE",
        [key],
      );
      const outcome = decideSlidingWindow({
        hitsMs: (existing.rows[0]?.hits ?? []).map((hit) => hit.getTime()),
        nowMs: Date.now(),
        limit: this.limit,
        windowSec: this.windowSec,
      });
      await client.query(
        `INSERT INTO rate_limit_hits (key_hash, hits, updated_at)
         VALUES ($1, $2::timestamptz[], now())
         ON CONFLICT (key_hash) DO UPDATE SET hits = EXCLUDED.hits, updated_at = now()`,
        [key, outcome.hitsMs.map((hitMs) => new Date(hitMs).toISOString())],
      );
      await client.query("COMMIT");
      return outcome.decision;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

export async function deleteExpiredRateLimitHits(
  pool: pg.Pool,
  windowSec: number,
): Promise<number> {
  const result = await pool.query(
    "DELETE FROM rate_limit_hits WHERE updated_at < now() - make_interval(secs => $1::float8)",
    [windowSec],
  );
  return result.rowCount ?? 0;
}
