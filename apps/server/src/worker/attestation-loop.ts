import type pg from "pg";
import type { Logger } from "pino";
import {
  resolveAttestationOutcome,
  scheduleOrGiveUp,
  type AttestationJobOutcome,
  type AttestationVerifyDeps,
} from "../attestation/verify-job.js";
import { claimDueAttestations, type ClaimedAttestation } from "../repos/token-attestations-verify-repo.js";
import { applyAttestationOutcome } from "./attestation-apply-outcome.js";

export type AttestationResolverDeps = AttestationVerifyDeps & { logger: Logger };

export type AttestationVerificationLoopDeps = AttestationResolverDeps & { pool: pg.Pool };

type ResolvedAttestation = { job: ClaimedAttestation; outcome: AttestationJobOutcome };

async function resolveOutcomeSafely(
  job: ClaimedAttestation,
  deps: AttestationResolverDeps,
): Promise<AttestationJobOutcome> {
  try {
    return await resolveAttestationOutcome(job, deps);
  } catch (error) {
    deps.logger.warn({ err: error, attestationId: job.id }, "attestation resolve threw unexpectedly; rescheduling");
    return scheduleOrGiveUp(job, deps);
  }
}

export async function resolveWithConcurrency(
  jobs: ClaimedAttestation[],
  concurrency: number,
  deps: AttestationResolverDeps,
): Promise<ResolvedAttestation[]> {
  const resolved: ResolvedAttestation[] = [];
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (nextIndex < jobs.length) {
      const job = jobs[nextIndex++];
      if (job === undefined) return;
      resolved.push({ job, outcome: await resolveOutcomeSafely(job, deps) });
    }
  });
  await Promise.all(workers);
  return resolved;
}

async function persistOutcome(deps: AttestationVerificationLoopDeps, resolved: ResolvedAttestation): Promise<void> {
  const client = await deps.pool.connect();
  try {
    await client.query("BEGIN");
    await applyAttestationOutcome(client, resolved.job.id, resolved.outcome);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    deps.logger.error({ err: error, attestationId: resolved.job.id }, "persist attestation outcome failed");
  } finally {
    client.release();
  }
}

export async function runAttestationVerificationPass(deps: AttestationVerificationLoopDeps): Promise<number> {
  const jobs = await claimDueAttestations(deps.pool, deps.config.ATTEST_WORKER_BATCH, deps.config.ATTEST_WORKER_LEASE_SEC);
  if (jobs.length === 0) return 0;
  const resolved = await resolveWithConcurrency(jobs, deps.config.WORKER_RPC_CONCURRENCY, deps);
  for (const entry of resolved) await persistOutcome(deps, entry);
  return jobs.length;
}

export function startAttestationVerificationLoop(deps: AttestationVerificationLoopDeps): () => void {
  let passInFlight = false;
  const tick = async (): Promise<void> => {
    if (passInFlight) return;
    passInFlight = true;
    try {
      await runAttestationVerificationPass(deps);
    } catch (error) {
      deps.logger.error({ err: error }, "attestation verification pass failed");
    } finally {
      passInFlight = false;
    }
  };
  const timer = setInterval(() => void tick(), deps.config.WORKER_POLL_INTERVAL_SEC * 1000);
  void tick();
  return () => clearInterval(timer);
}
