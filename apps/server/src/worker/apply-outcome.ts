import type { Config } from "../config.js";
import {
  closeUnverifiable,
  finalizeVerification,
  rescheduleJob,
  type SqlExecutor,
} from "../repos/activities-verify-repo.js";
import type { JobOutcome } from "./verify-job.js";

export async function applyJobOutcome(
  client: SqlExecutor,
  activityId: bigint,
  outcome: JobOutcome,
  config: Config,
): Promise<void> {
  if (outcome.kind === "reschedule") {
    await rescheduleJob(client, activityId, outcome.delayMs, outcome.lastError);
    return;
  }
  if (outcome.kind === "close_unverifiable") {
    await closeUnverifiable(client, activityId);
    return;
  }
  await finalizeVerification(client, activityId, outcome.verdict, config);
}
