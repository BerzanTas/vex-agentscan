import { pino } from "pino";
import { buildAttestationChainRegistry, resolveChain } from "@agentscan/core";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { makeChainReader } from "./verification/viem-chain-reader.js";
import { startAttestationVerificationLoop } from "./worker/attestation-loop.js";
import { startHeartbeat } from "./worker/heartbeat.js";
import { startVerificationLoop } from "./worker/loop.js";
import { startPurgeInterval } from "./worker/purge.js";

const config = loadConfig(process.env);
const pool = createPool(config.DATABASE_URL, {
  max: config.DATABASE_POOL_MAX,
  connectionTimeoutMillis: config.DATABASE_POOL_ACQUIRE_TIMEOUT_MS,
});
const logger = pino();

await pool.query("SELECT 1");
startHeartbeat({ pool, workerName: "worker", intervalSec: config.WORKER_POLL_INTERVAL_SEC, logger });
startVerificationLoop({
  pool,
  config,
  now: () => new Date(),
  resolveChain,
  chainReaderFor: (entry, context) => makeChainReader(entry, config, context),
  logger,
});
startAttestationVerificationLoop({
  pool,
  config,
  now: () => new Date(),
  resolveChain,
  chainReaderFor: (entry, context) => makeChainReader(entry, config, context),
  chainRegistry: buildAttestationChainRegistry(config.attestFactoryAddressesByChainId),
  logger,
});
if (config.PURGE_IN_WORKER) startPurgeInterval({ pool, config, logger });
logger.info("worker ready");
