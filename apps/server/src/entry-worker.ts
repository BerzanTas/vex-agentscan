import { pino } from "pino";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";

const config = loadConfig(process.env);
const pool = createPool(config.DATABASE_URL);
const logger = pino();

await pool.query("SELECT 1");
logger.info("worker ready");
setInterval(() => logger.debug("worker idle"), config.WORKER_POLL_INTERVAL_SEC * 1000);
