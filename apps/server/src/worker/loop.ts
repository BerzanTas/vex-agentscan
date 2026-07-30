import type pg from "pg";
import type { Logger } from "pino";
import type { ChainEntry, ChainReader, ResolveChain } from "@agentscan/core";
import type { Config } from "../config.js";
import { claimDueJobs } from "../repos/activities-verify-repo.js";
import { runVerifyJob } from "./verify-job.js";

export type VerificationLoopDeps = {
  pool: pg.Pool;
  config: Config;
  resolveChain: ResolveChain;
  chainReaderFor: (entry: ChainEntry) => ChainReader;
  logger: Logger;
};

export async function runVerificationPass(deps: VerificationLoopDeps): Promise<number> {
  const client = await deps.pool.connect();
  try {
    await client.query("BEGIN");
    const jobs = await claimDueJobs(client, deps.config.WORKER_BATCH);
    for (const job of jobs) await runVerifyJob(client, job, deps);
    await client.query("COMMIT");
    return jobs.length;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function startVerificationLoop(deps: VerificationLoopDeps): () => void {
  let passInFlight = false;
  const tick = async (): Promise<void> => {
    if (passInFlight) return;
    passInFlight = true;
    try {
      await runVerificationPass(deps);
    } catch (error) {
      deps.logger.error({ err: error }, "verification pass failed");
    } finally {
      passInFlight = false;
    }
  };
  const timer = setInterval(() => void tick(), deps.config.WORKER_POLL_INTERVAL_SEC * 1000);
  void tick();
  return () => clearInterval(timer);
}
