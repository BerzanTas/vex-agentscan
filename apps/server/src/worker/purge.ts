import type pg from "pg";
import type { Logger } from "pino";
import type { Config } from "../config.js";
import { deleteExpiredHandshakeChallenges } from "../repos/handshake-repo.js";
import { findAgentsDueForPurge, purgeAgentData } from "../repos/purge-repo.js";
import { deleteExpiredRateLimitHits } from "../repos/rate-limit-repo.js";

export async function runPurgeSweep(pool: pg.Pool, config: Config): Promise<{ purgedAgents: number }> {
  const dueAgents = await findAgentsDueForPurge(pool, config.PURGE_DELAY_H);
  let purgedAgents = 0;
  for (const agentHash of dueAgents) {
    if (await purgeAgentData(pool, agentHash)) purgedAgents += 1;
  }
  const longestRateLimitWindowSec = Math.max(config.INGEST_RATE_WINDOW_SEC, config.REGISTER_RATE_WINDOW_SEC);
  await deleteExpiredRateLimitHits(pool, longestRateLimitWindowSec);
  await deleteExpiredHandshakeChallenges(pool);
  return { purgedAgents };
}

export function startPurgeInterval(args: { pool: pg.Pool; config: Config; logger: Logger }): () => void {
  const sweep = async (): Promise<void> => {
    try {
      await runPurgeSweep(args.pool, args.config);
    } catch (error) {
      args.logger.error({ err: error }, "purge sweep failed");
    }
  };
  const timer = setInterval(() => void sweep(), args.config.PURGE_INTERVAL_MIN * 60 * 1000);
  void sweep();
  return () => clearInterval(timer);
}
