import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { queueDepth } from "../../repos/activities-verify-repo.js";
import { startTestDb } from "../../testing/pg-harness.js";
import { seedActivity } from "../../testing/seed.js";

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
  await pool.query("DELETE FROM verification_jobs");
  await pool.query("DELETE FROM activities");
});

async function seedJobAt(publicId: string, nextAttemptAt: Date): Promise<bigint> {
  const activityId = await seedActivity(pool, { publicId, verificationState: "queued" });
  await pool.query("INSERT INTO verification_jobs (activity_id, next_attempt_at) VALUES ($1, $2)", [
    activityId.toString(),
    nextAttemptAt,
  ]);
  return activityId;
}

describe("queueDepth", () => {
  it("reports zero depth when no jobs are queued", async () => {
    expect(await queueDepth(pool)).toEqual({ dueJobs: 0, totalPending: 0, oldestDueAgeSec: null });
  });

  it("counts due jobs against total pending and reports the oldest due job's age", async () => {
    await seedJobAt("due-old", new Date(Date.now() - 120_000));
    await seedJobAt("due-new", new Date(Date.now() - 30_000));
    await seedJobAt("not-due-yet", new Date(Date.now() + 3_600_000));

    const depth = await queueDepth(pool);

    expect(depth.dueJobs).toBe(2);
    expect(depth.totalPending).toBe(3);
    expect(depth.oldestDueAgeSec).toBeGreaterThan(110);
    expect(depth.oldestDueAgeSec).toBeLessThan(130);
  });

  it("reports a null oldest-age when jobs are pending but none are due yet", async () => {
    await seedJobAt("future-only", new Date(Date.now() + 3_600_000));

    const depth = await queueDepth(pool);

    expect(depth).toEqual({ dueJobs: 0, totalPending: 1, oldestDueAgeSec: null });
  });
});
