import { resolveChain } from "@agentscan/core";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";

const config = loadConfig(process.env);
const pool = createPool(config.DATABASE_URL);
const app = await buildApp({ pool, config, resolveChain });
await app.listen({ port: config.PORT, host: "0.0.0.0" });
