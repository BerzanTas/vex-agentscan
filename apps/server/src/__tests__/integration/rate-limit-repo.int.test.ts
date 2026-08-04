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
});
