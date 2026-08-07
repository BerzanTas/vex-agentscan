import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { agentLeaderboard, countActiveAgents7d } from "../../repos/read-repo.js";
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
  await pool.query("DELETE FROM agents");
});

describe("zapytania okienkowe", () => {
  it("liczy wyłącznie zweryfikowanych agentów z ostatnich 7 dni", async () => {
    await seedActivity(pool, {
      agentHash: "a".repeat(64),
      publicId: "recent",
      verificationState: "verified_full",
      confirmedDaysAgo: 1,
    });
    await seedActivity(pool, {
      agentHash: "b".repeat(64),
      publicId: "stale",
      verificationState: "verified_full",
      confirmedDaysAgo: 10,
    });

    expect(await countActiveAgents7d(pool)).toBe(1);
  });

  it("sumuje wolumen agenta z ostatnich 30 dni", async () => {
    await seedActivity(pool, {
      agentHash: "c".repeat(64),
      publicId: "counted",
      verificationState: "verified_full",
      eventRole: "swap",
      usdInEst: "100.00",
      confirmedDaysAgo: 2,
    });

    expect(await agentLeaderboard(pool, 30 * 86_400)).toEqual([
      {
        agentHash: "c".repeat(64),
        volumeUsd: "100.00",
        txCount: 1,
        protocolCount: 1,
        chainCount: 1,
        lastSeenSeconds: expect.any(Number),
      },
    ]);
  });
});
