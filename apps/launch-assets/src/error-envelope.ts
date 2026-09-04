/**
 * THE PUBLIC-SAFE ERROR SHAPE for this host, plus the correlation id that
 * every one of them carries.
 *
 * Shape follows the AgentScan API (`apps/server/src/plugins/error-envelope.ts`)
 * so a Vex client parses one envelope for both services, with ONE deliberate
 * addition: `correlationId`. The API does not need it - a rejected ingest
 * batch names the offending index - but an asset upload that fails has one
 * user staring at one dialog, and "quote this id" is the difference between a
 * support conversation and a guess. The id is Fastify's request id, which is
 * also what the access log and every log line of the request carry.
 *
 * Nothing else leaks: the message text is written here, never taken from a
 * driver, a filesystem error or a provider.
 */

import type { FastifyError, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

export const CORRELATION_HEADER = "x-correlation-id";

type ErrorEnvelopeOptions = { poolTimeoutRetryAfterSec: number };

const POOL_ACQUIRE_TIMEOUT_MESSAGE = "timeout exceeded when trying to connect";

/** The one way this service answers a request it will not serve. */
export function sendError(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
): FastifyReply {
  return reply
    .status(status)
    .send({ error: { code, message, correlationId: request.id } });
}

export const errorEnvelope: FastifyPluginAsync<ErrorEnvelopeOptions> = async (app, options) => {
  app.addHook("onRequest", async (request, reply) => {
    reply.header(CORRELATION_HEADER, request.id);
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.code === "FST_ERR_CTP_BODY_TOO_LARGE" || error.code === "FST_REQ_FILE_TOO_LARGE") {
      return sendError(request, reply, 413, "payload_too_large", "the upload is larger than the cap");
    }
    if (error.code === "FST_INVALID_MULTIPART_CONTENT_TYPE") {
      return sendError(request, reply, 415, "unsupported_media_type", "expected a multipart/form-data body");
    }
    if (error.message === POOL_ACQUIRE_TIMEOUT_MESSAGE) {
      request.log.error(error);
      reply.header("retry-after", String(options.poolTimeoutRetryAfterSec));
      return sendError(request, reply, 503, "database_unavailable", "database connection pool exhausted");
    }
    request.log.error(error);
    return sendError(request, reply, 500, "internal", "internal server error");
  });

  app.setNotFoundHandler((request, reply) =>
    sendError(request, reply, 404, "not_found", "route not found"),
  );
};

Object.defineProperty(errorEnvelope, Symbol.for("skip-override"), { value: true });
