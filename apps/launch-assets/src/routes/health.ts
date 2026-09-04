/**
 * `GET /healthz` - liveness plus the two dependencies this host cannot serve
 * without: its database (the metadata is there) and its volume (the bytes are
 * there). A store that failed to mount is the failure mode worth catching:
 * the process starts perfectly and then 503s every read.
 *
 * The probe stays cheap - one `SELECT 1` and one `stat` - so it can be polled
 * without becoming load, and it never attempts repair.
 */

import { stat } from "node:fs/promises";
import type { FastifyPluginAsync } from "fastify";
import type { AssetsDeps } from "../app.js";

const unhealthy = { error: { code: "unhealthy", message: "service unhealthy" } };

export const healthRoutes: FastifyPluginAsync<AssetsDeps> = async (app, deps) => {
  app.get("/healthz", async (request, reply) => {
    try {
      await deps.pool.query("SELECT 1");
      const stats = await stat(deps.config.ASSETS_DIR);
      if (!stats.isDirectory()) throw new Error("ASSETS_DIR is not a directory");
    } catch (error) {
      request.log.error(error);
      return reply.status(503).send(unhealthy);
    }
    return { db: "ok", store: "ok" };
  });
};
