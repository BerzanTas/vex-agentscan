import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { startTestDb } from "../../testing/pg-harness.js";
import { PostgresSlidingWindowLimiter } from "../../repos/rate-limit-repo.js";

let db: Awaited<ReturnType<typeof startTestDb>>;
let pool: pg.Pool;

beforeAll(async () => {
  db = await startTestDb();
  pool = db.pool;
}, 120_000);

afterAll(async () => {
  await db.stop();
});

beforeEach(async () => {
  await pool.query("DELETE FROM rate_limit_hits");
});

async function blockedAdvisoryLockWaiterCount(): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM pg_stat_activity
     WHERE wait_event_type = 'Lock' AND query ILIKE '%pg_advisory_xact_lock%' AND pid <> pg_backend_pid()`,
  );
  return Number(result.rows[0]?.count ?? "0");
}

async function waitUntilBlockedOnAdvisoryLock(): Promise<void> {
  let waiters = await blockedAdvisoryLockWaiterCount();
  while (waiters === 0) {
    waiters = await blockedAdvisoryLockWaiterCount();
  }
}

describe("PostgresSlidingWindowLimiter", () => {
  it("dzieli licznik między dwie niezależne instancje limitera", async () => {
    const first = new PostgresSlidingWindowLimiter(pool, 2, 60);
    const second = new PostgresSlidingWindowLimiter(pool, 2, 60);

    expect(await first.allow("shared-key")).toEqual({ ok: true });
    expect(await second.allow("shared-key")).toEqual({ ok: true });

    const third = await second.allow("shared-key");
    expect(third.ok).toBe(false);
  });

  it("nie miesza kluczy", async () => {
    const limiter = new PostgresSlidingWindowLimiter(pool, 1, 60);
    expect(await limiter.allow("key-a")).toEqual({ ok: true });
    expect(await limiter.allow("key-b")).toEqual({ ok: true });
  });

  it("odrzucone żądanie nie przedłuża okna", async () => {
    const limiter = new PostgresSlidingWindowLimiter(pool, 1, 60);
    await limiter.allow("key");
    await limiter.allow("key");
    const stored = await pool.query<{ count: number }>(
      "SELECT cardinality(hits)::int AS count FROM rate_limit_hits",
    );
    expect(stored.rows[0]?.count).toBe(1);
  });

  it("zwraca retryAfterSec w granicach okna", async () => {
    const limiter = new PostgresSlidingWindowLimiter(pool, 1, 60);
    await limiter.allow("key");
    const rejected = (await limiter.allow("key")) as { ok: false; retryAfterSec: number };
    expect(rejected.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(rejected.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it("blokuje równoległy allow() na tym samym kluczu dopóki inna transakcja trzyma blokadę adwisyjną, i wznawia go po jej zwolnieniu", async () => {
    const limiter = new PostgresSlidingWindowLimiter(pool, 1, 60);
    const lockClient = await pool.connect();
    try {
      await lockClient.query("BEGIN");
      await lockClient.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", ["fresh-key"]);

      let allowSettled = false;
      const allowPromise = limiter.allow("fresh-key").then((decision) => {
        allowSettled = true;
        return decision;
      });

      await waitUntilBlockedOnAdvisoryLock();
      expect(allowSettled).toBe(false);

      await lockClient.query("COMMIT");
      const decision = await allowPromise;

      expect(allowSettled).toBe(true);
      expect(decision).toEqual({ ok: true });
    } finally {
      lockClient.release();
    }
  });
});
