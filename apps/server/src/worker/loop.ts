import type pg from "pg";
import type { Logger } from "pino";
import type { ChainEntry, ChainReader, ResolveChain } from "@agentscan/core";
import type { Config } from "../config.js";
import { claimDueJobs, queueDepth, type ClaimedJob } from "../repos/activities-verify-repo.js";
import { applyJobOutcome } from "./apply-outcome.js";
import { resolveJobOutcome, type ChainReaderContext, type JobOutcome } from "./verify-job.js";

export type VerificationLoopDeps = {
  pool: pg.Pool;
  config: Config;
  now: () => Date;
  resolveChain: ResolveChain;
  chainReaderFor: (entry: ChainEntry, context: ChainReaderContext) => ChainReader;
  logger: Logger;
};

type ResolvedJob = { job: ClaimedJob; outcome: JobOutcome };

async function resolveWithConcurrency(
  jobs: ClaimedJob[],
  concurrency: number,
  deps: VerificationLoopDeps,
): Promise<ResolvedJob[]> {
  const resolved: ResolvedJob[] = [];
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (nextIndex < jobs.length) {
      const job = jobs[nextIndex++];
      if (job === undefined) return;
      resolved.push({ job, outcome: await resolveJobOutcome(job, deps) });
    }
  });
  await Promise.all(workers);
  return resolved;
}

async function persistOutcome(deps: VerificationLoopDeps, resolved: ResolvedJob): Promise<void> {
  const client = await deps.pool.connect();
  try {
    await client.query("BEGIN");
    await applyJobOutcome(client, resolved.job.activityId, resolved.outcome, deps.config);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    deps.logger.error({ err: error, activityId: String(resolved.job.activityId) }, "persist outcome failed");
  } finally {
    client.release();
  }
}

async function logQueueDepth(deps: VerificationLoopDeps): Promise<void> {
  try {
    const depth = await queueDepth(deps.pool);
    if (depth.totalPending === 0) return;
    deps.logger.info(
      {
        dueJobs: depth.dueJobs,
        totalPending: depth.totalPending,
        oldestDueAgeSec: depth.oldestDueAgeSec,
      },
      "verification queue depth",
    );
  } catch (error) {
    deps.logger.warn({ err: error }, "queue depth read failed");
  }
}

export async function runVerificationPass(deps: VerificationLoopDeps): Promise<number> {
  await logQueueDepth(deps);
  const jobs = await claimDueJobs(deps.pool, deps.config.WORKER_BATCH, deps.config.WORKER_LEASE_SEC);
  if (jobs.length === 0) return 0;
  const resolved = await resolveWithConcurrency(jobs, deps.config.WORKER_RPC_CONCURRENCY, deps);
  for (const entry of resolved) await persistOutcome(deps, entry);
  return jobs.length;
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
