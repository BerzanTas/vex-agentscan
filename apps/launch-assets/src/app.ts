/**
 * The launch-assets host: a public, content-addressed image store for the art
 * a user puts on a token they launch.
 *
 * IT IS ITS OWN SERVICE, not a route on the AgentScan API, because the two
 * have opposite postures. The API takes private activity under an explicit
 * consent and publishes aggregates; this host takes bytes the user has agreed
 * to make PUBLIC and serves them to anyone, forever, uncached-by-identity. The
 * only thing they share is the install credential, and that now lives in
 * `@agentscan/install-identity` so both verify it with one implementation.
 *
 * WHY CONTENT ADDRESSING IS THE WHOLE DESIGN: the URL minted here goes into a
 * token's on-chain metadata after a user approves it. Addressing by the sha256
 * of the bytes means the approval binds the picture, not a pointer someone
 * could later repoint. The rejected alternative - accepting a public URL the
 * user supplies - could not make that promise.
 */

import { fastify, type FastifyBaseLogger, type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import type pg from "pg";
import type { AssetByteStore } from "./byte-store.js";
import type { AssetsConfig } from "./config.js";
import { errorEnvelope } from "./error-envelope.js";
import { assetSecurityHeaders } from "./security-headers.js";
import { healthRoutes } from "./routes/health.js";
import { serveRoutes } from "./routes/serve.js";
import { uploadRoutes } from "./routes/upload.js";

export type AssetsDeps = {
  pool: pg.Pool;
  config: AssetsConfig;
  store: AssetByteStore;
  loggerInstance?: FastifyBaseLogger;
};

export async function buildAssetsApp(deps: AssetsDeps): Promise<FastifyInstance> {
  const app = fastify({
    ...(deps.loggerInstance
      ? { loggerInstance: deps.loggerInstance }
      : { logger: { redact: { paths: ["req.headers.authorization"], censor: "[redacted]" } } }),
    trustProxy: deps.config.TRUST_PROXY ?? false,
  });
  await app.register(assetSecurityHeaders);
  await app.register(errorEnvelope, {
    poolTimeoutRetryAfterSec: deps.config.POOL_TIMEOUT_RETRY_AFTER_SEC,
  });
  await app.register(multipart, {
    // One file, capped. Busboy stops reading past the cap rather than buffering
    // it first, so an oversized upload costs the cap and not the payload.
    limits: { fileSize: deps.config.ASSETS_MAX_UPLOAD_BYTES, files: 1 },
  });
  for (const plugin of [healthRoutes, serveRoutes, uploadRoutes]) {
    await app.register(plugin, deps);
  }
  return app;
}
