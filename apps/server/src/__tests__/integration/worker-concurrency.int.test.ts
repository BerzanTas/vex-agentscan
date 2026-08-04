import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { pino } from "pino";
import { resolveChain } from "@agentscan/core";
import { loadConfig } from "../../config.js";
import { claimDueJobs } from "../../repos/activities-verify-repo.js";
import { startTestDb } from "../../testing/pg-harness.js";
import { seedQueuedJob } from "../../testing/seed.js";
import { runVerificationPass } from "../../worker/loop.js";

let db: Awaited<ReturnType<typeof startTestDb>>;
let pool: pg.Pool;

const config = loadConfig({ DATABASE_URL: "postgres://unused", WORKER_BATCH: "1" });
const logger = pino({ level: "silent" });

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

async function idleInTransactionCount(): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM pg_stat_activity
     WHERE datname = current_database() AND state = 'idle in transaction' AND pid <> pg_backend_pid()`,
  );
  return Number(result.rows[0]?.count ?? "0");
}

const byValue = (a: bigint, b: bigint) => Number(a - b);

describe("współbieżność workera", () => {
  it("wolny ChainReader nie trzyma blokady wiersza ani otwartej transakcji podczas oczekiwania na RPC", async () => {
    const activityId = await seedQueuedJob(pool, "slow-job");

    let releaseSlow: () => void = () => undefined;
    const slowGate = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    let markClaimed: () => void = () => undefined;
    const claimed = new Promise<void>((resolve) => {
      markClaimed = resolve;
    });

    const slowPass = runVerificationPass({
      pool,
      config,
      resolveChain,
      logger,
      chainReaderFor: () => {
        markClaimed();
        return {
          getReceipt: async () => {
            await slowGate;
            return null;
          },
        };
      },
    });

    await claimed;

    const lockClient = await pool.connect();
    try {
      await lockClient.query("BEGIN");
      const locked = await lockClient.query(
        "SELECT 1 FROM verification_jobs WHERE activity_id = $1 FOR UPDATE NOWAIT",
        [activityId.toString()],
      );
      expect(locked.rowCount).toBe(1);
    } finally {
      await lockClient.query("ROLLBACK").catch(() => undefined);
      lockClient.release();
    }

    expect(await idleInTransactionCount()).toBe(0);

    releaseSlow();
    await slowPass;
  });

  it("claim wyklucza wiersz zablokowany przez trwającą w locie transakcję", async () => {
    const lockedId = await seedQueuedJob(pool, "locked-job");
    const openId1 = await seedQueuedJob(pool, "open-job-1");
    const openId2 = await seedQueuedJob(pool, "open-job-2");
    const openId3 = await seedQueuedJob(pool, "open-job-3");

    const lockClient = await pool.connect();
    try {
      await lockClient.query("BEGIN");
      await lockClient.query("SELECT 1 FROM verification_jobs WHERE activity_id = $1 FOR UPDATE", [
        lockedId.toString(),
      ]);

      const claimedJobs = await claimDueJobs(pool, 4, 60);

      expect(claimedJobs.map((job) => job.activityId).sort(byValue)).toEqual(
        [openId1, openId2, openId3].sort(byValue),
      );
    } finally {
      await lockClient.query("ROLLBACK").catch(() => undefined);
      lockClient.release();
    }
  });

  it("dzierżawa zwalnia zadanie dopiero po jej wygaśnięciu", async () => {
    const activityId = await seedQueuedJob(pool, "leased-job");

    expect(await claimDueJobs(pool, 1, 60)).toHaveLength(1);
    expect(await claimDueJobs(pool, 1, 60)).toHaveLength(0);

    await pool.query(
      "UPDATE verification_jobs SET next_attempt_at = now() - interval '1 second' WHERE activity_id = $1",
      [activityId.toString()],
    );

    expect(await claimDueJobs(pool, 1, 60)).toHaveLength(1);
  });
});
