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

describe("współbieżność workera", () => {
  it("wolny ChainReader nie blokuje drugiego przebiegu", async () => {
    await seedQueuedJob(pool, "slow-job");
    await seedQueuedJob(pool, "fast-job");

    let releaseSlow: () => void = () => undefined;
    const slowGate = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });

    const slowPass = runVerificationPass({
      pool,
      config,
      resolveChain,
      logger,
      chainReaderFor: () => ({
        getReceipt: async () => {
          await slowGate;
          return null;
        },
      }),
    });

    const raced = await Promise.race([
      runVerificationPass({
        pool,
        config,
        resolveChain,
        logger,
        chainReaderFor: () => ({ getReceipt: async () => null }),
      }).then(() => "fast-finished"),
      new Promise((resolve) => setTimeout(() => resolve("timed-out"), 3_000)),
    ]);

    expect(raced).toBe("fast-finished");
    releaseSlow();
    await slowPass;
  });

  it("dzierżawa zwalnia zadanie dopiero po jej wygaśnięciu", async () => {
    await seedQueuedJob(pool, "leased-job");

    expect(await claimDueJobs(pool, 1, 1)).toHaveLength(1);
    expect(await claimDueJobs(pool, 1, 1)).toHaveLength(0);

    await new Promise((resolve) => setTimeout(resolve, 1_100));
    expect(await claimDueJobs(pool, 1, 1)).toHaveLength(1);
  });
});
