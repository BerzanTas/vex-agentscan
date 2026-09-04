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

/**
 * THE BODY IS THE IMAGE. Every parser this service has yields a Buffer and
 * nothing else: there is no JSON route, no form and no multipart envelope, so
 * the defaults are removed rather than left as an unused surface on a trust
 * boundary. Anything outside this list is answered 415 by Fastify before a
 * handler runs.
 *
 * THE DECLARED TYPE SELECTS THE PARSER AND NOTHING ELSE. `image/png` here
 * means "these bytes arrive raw", never "these bytes are a PNG": the stored
 * type is decided by `validateImageBytes` from the magic bytes. The image
 * types are accepted alongside `application/octet-stream` only because an
 * HTTP client that knows what it is holding will say so.
 */
const RAW_IMAGE_CONTENT_TYPES = [
  "application/octet-stream",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

function registerImageBodyParsers(app: FastifyInstance): void {
  app.removeAllContentTypeParsers();
  app.addContentTypeParser(
    RAW_IMAGE_CONTENT_TYPES,
    { parseAs: "buffer" },
    (_request, body, done) => {
      done(null, body);
    },
  );
}

export async function buildAssetsApp(deps: AssetsDeps): Promise<FastifyInstance> {
  const app = fastify({
    ...(deps.loggerInstance
      ? { loggerInstance: deps.loggerInstance }
      : { logger: { redact: { paths: ["req.headers.authorization"], censor: "[redacted]" } } }),
    trustProxy: deps.config.TRUST_PROXY ?? false,
    // THE CAP IS THE SERVER'S, not a check after the fact. Fastify stops
    // reading at `bodyLimit` and raises FST_ERR_CTP_BODY_TOO_LARGE, so an
    // oversized upload costs the cap and never the payload. `PUT /v1/assets`
    // is the only route with a body, so one global limit is the whole policy.
    bodyLimit: deps.config.ASSETS_MAX_UPLOAD_BYTES,
  });
  await app.register(assetSecurityHeaders);
  await app.register(errorEnvelope, {
    poolTimeoutRetryAfterSec: deps.config.POOL_TIMEOUT_RETRY_AFTER_SEC,
  });
  registerImageBodyParsers(app);
  for (const plugin of [healthRoutes, serveRoutes, uploadRoutes]) {
    await app.register(plugin, deps);
  }
  return app;
}
