import pg from "pg";
import { buildAssetsApp } from "./app.js";
import { AssetByteStore } from "./byte-store.js";
import { loadAssetsConfig } from "./config.js";

const config = loadAssetsConfig(process.env);
const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: config.DATABASE_POOL_MAX,
  connectionTimeoutMillis: config.DATABASE_POOL_ACQUIRE_TIMEOUT_MS,
});
const app = await buildAssetsApp({ pool, config, store: new AssetByteStore(config.ASSETS_DIR) });
await app.listen({ port: config.PORT, host: "0.0.0.0" });
