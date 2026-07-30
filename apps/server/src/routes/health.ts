import type { FastifyPluginAsync } from "fastify";
import type pg from "pg";
import type { Deps } from "../app.js";

const unhealthy = { error: { code: "unhealthy", message: "service unhealthy" } };

async function latestWorkerAgeSec(pool: pg.Pool): Promise<number | null> {
  const result = await pool.query<{ age_sec: number | null }>(
    "SELECT EXTRACT(EPOCH FROM (now() - max(beat_at)))::float8 AS age_sec FROM worker_heartbeat",
  );
  return result.rows[0]?.age_sec ?? null;
}

export const healthRoutes: FastifyPluginAsync<Deps> = async (app, deps) => {
  app.get<{ Querystring: { strict?: string } }>("/healthz", async (request, reply) => {
    let workerAgeSec: number | null;
    try {
      await deps.pool.query("SELECT 1");
      workerAgeSec = await latestWorkerAgeSec(deps.pool);
    } catch (error) {
      request.log.error(error);
      return reply.status(503).send(unhealthy);
    }
    const strict = request.query.strict === "1";
    const heartbeatStale =
      workerAgeSec === null || workerAgeSec > deps.config.WORKER_HEARTBEAT_MAX_AGE_SEC;
    if (strict && heartbeatStale) return reply.status(503).send(unhealthy);
    return { db: "ok", workerAgeSec };
  });
};
