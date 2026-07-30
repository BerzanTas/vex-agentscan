import { pino } from "pino";
import { resolveChain } from "@agentscan/core";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { makeChainReader } from "./verification/viem-chain-reader.js";
import { startHeartbeat } from "./worker/heartbeat.js";
import { startVerificationLoop } from "./worker/loop.js";
import { startPurgeInterval } from "./worker/purge.js";

const config = loadConfig(process.env);
const pool = createPool(config.DATABASE_URL);
const logger = pino();

await pool.query("SELECT 1");
startHeartbeat({ pool, workerName: "worker", intervalSec: config.WORKER_POLL_INTERVAL_SEC, logger });
startVerificationLoop({
  pool,
  config,
  resolveChain,
  chainReaderFor: (entry, context) => makeChainReader(entry, config, context),
  logger,
});
startPurgeInterval({ pool, config, logger });
logger.info("worker ready");
