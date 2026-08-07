import { Writable } from "node:stream";
import { pino, type Logger } from "pino";
import { resolveChain } from "@agentscan/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { loadConfig } from "../../config.js";
import { startTestDb } from "../../testing/pg-harness.js";
import { seedQueuedJob } from "../../testing/seed.js";
import { runVerificationPass, type VerificationLoopDeps } from "../../worker/loop.js";

let db: Awaited<ReturnType<typeof startTestDb>>;
let pool: pg.Pool;

const config = loadConfig({ DATABASE_URL: "postgres://unused" });

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

function capturingLogger(): { logger: Logger; lines: () => Record<string, unknown>[] } {
  const chunks: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  const logger = pino(destination);
  const lines = () =>
    chunks
      .join("")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  return { logger, lines };
}

const stalledDeps = (logger: Logger): VerificationLoopDeps => ({
  pool,
  config,
  now: () => new Date(),
  resolveChain,
  chainReaderFor: () => ({ getReceipt: async () => null }),
  logger,
});

describe("worker queue depth logging", () => {
  it("logs due/total/oldest-age at info level when the queue is non-empty", async () => {
    await seedQueuedJob(pool, "depth-log-job");
    const { logger, lines } = capturingLogger();

    await runVerificationPass(stalledDeps(logger));

    const depthLines = lines().filter((entry) => entry.msg === "verification queue depth");
    expect(depthLines).toHaveLength(1);
    expect(depthLines[0]).toMatchObject({ totalPending: 1 });
    expect(typeof depthLines[0]?.dueJobs).toBe("number");
    expect(depthLines[0]?.oldestDueAgeSec === null || typeof depthLines[0]?.oldestDueAgeSec === "number").toBe(
      true,
    );
  });

  it("stays silent when the verification_jobs table is empty", async () => {
    const { logger, lines } = capturingLogger();

    await runVerificationPass(stalledDeps(logger));

    expect(lines().filter((entry) => entry.msg === "verification queue depth")).toHaveLength(0);
  });
});
