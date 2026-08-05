import type { FastifyError, FastifyPluginAsync } from "fastify";

type ErrorEnvelopeOptions = { poolTimeoutRetryAfterSec: number };

const POOL_ACQUIRE_TIMEOUT_MESSAGE = "timeout exceeded when trying to connect";

export const errorEnvelope: FastifyPluginAsync<ErrorEnvelopeOptions> = async (app, options) => {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      return reply
        .status(413)
        .send({ error: { code: "payload_too_large", message: "request body too large" } });
    }
    if (error.message === POOL_ACQUIRE_TIMEOUT_MESSAGE) {
      request.log.error(error);
      return reply
        .status(503)
        .header("retry-after", String(options.poolTimeoutRetryAfterSec))
        .send({
          error: { code: "database_unavailable", message: "database connection pool exhausted" },
        });
    }
    request.log.error(error);
    return reply.status(500).send({ error: { code: "internal", message: "internal server error" } });
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ error: { code: "not_found", message: "route not found" } }),
  );
};

Object.defineProperty(errorEnvelope, Symbol.for("skip-override"), { value: true });
