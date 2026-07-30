import {
  BANNED_INGEST_FIELDS,
  eventSchema,
  eventsBatchSchema,
  type EventsResult,
  type IngestEvent,
} from "@agentscan/contract";
import type { FastifyBaseLogger, FastifyPluginAsync, FastifyReply } from "fastify";
import type pg from "pg";
import type { Deps } from "../app.js";
import { authenticateAgent, bearerTokenFrom } from "../plugins/auth.js";
import { SlidingWindowLimiter } from "../plugins/rate-limit.js";
import { applyEvent, type ApplyEventOutcome } from "../repos/activities-ingest-repo.js";

const sendError = (reply: FastifyReply, status: number, code: string, message: string) =>
  reply.status(status).send({ error: { code, message } });

function bannedFieldsIn(rawEvent: unknown): string[] {
  if (rawEvent === null || typeof rawEvent !== "object") return [];
  return BANNED_INGEST_FIELDS.filter((field) => field in rawEvent);
}

async function applyEventInTransaction(
  client: pg.PoolClient,
  agentHash: string,
  event: IngestEvent,
  schemaVersion: number,
  backfill: boolean,
): Promise<ApplyEventOutcome> {
  await client.query("BEGIN");
  try {
    const outcome = await applyEvent(client, agentHash, event, schemaVersion, backfill);
    await client.query("COMMIT");
    return outcome;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function ingestBatch(
  pool: pg.Pool,
  log: FastifyBaseLogger,
  agentHash: string,
  rawEvents: unknown[],
  schemaVersion: number,
  backfill: boolean,
): Promise<EventsResult> {
  const result: EventsResult = { accepted: 0, duplicates: 0, rejected: [] };
  const client = await pool.connect();
  try {
    for (const [index, rawEvent] of rawEvents.entries()) {
      const bannedFields = bannedFieldsIn(rawEvent);
      if (bannedFields.length > 0) {
        log.warn({ bannedFields }, "stripped banned ingest fields");
      }
      const parsedEvent = eventSchema.safeParse(rawEvent);
      if (!parsedEvent.success) {
        result.rejected.push({ index, code: "validation_failed" });
        continue;
      }
      const outcome = await applyEventInTransaction(
        client,
        agentHash,
        parsedEvent.data,
        schemaVersion,
        backfill,
      );
      if (outcome === "accepted") result.accepted += 1;
      else result.duplicates += 1;
    }
  } finally {
    client.release();
  }
  return result;
}

export const eventsRoutes: FastifyPluginAsync<Deps> = async (app, deps) => {
  const ingestLimiter = new SlidingWindowLimiter(
    deps.config.INGEST_RATE_LIMIT_PER_TOKEN,
    deps.config.INGEST_RATE_WINDOW_SEC,
  );

  app.post("/v1/events", async (request, reply) => {
    const bearerToken = bearerTokenFrom(request.headers.authorization);
    if (!bearerToken) {
      return sendError(reply, 401, "unauthorized", "missing or malformed bearer token");
    }
    const agent = await authenticateAgent(deps.pool, bearerToken);
    if (!agent) {
      return sendError(reply, 401, "unauthorized", "unknown token");
    }
    if (agent.status === "revoked") {
      return sendError(reply, 410, "consent_revoked", "agent consent has been revoked");
    }
    if (agent.status === "quarantined") {
      return sendError(reply, 403, "quarantined", "agent is quarantined");
    }
    const rateDecision = ingestLimiter.allow(bearerToken);
    if (!rateDecision.ok) {
      return reply
        .status(429)
        .header("retry-after", String(rateDecision.retryAfterSec))
        .send({ error: { code: "rate_limited", message: "too many ingest requests" } });
    }
    const parsedBatch = eventsBatchSchema.safeParse(request.body);
    if (!parsedBatch.success) {
      return sendError(reply, 400, "validation_failed", "events batch failed validation");
    }
    if (parsedBatch.data.agentHash !== agent.agentHash) {
      return sendError(reply, 403, "not_registered", "agentHash does not match the ingest token");
    }
    if (parsedBatch.data.events.length > deps.config.MAX_BATCH_EVENTS) {
      return sendError(reply, 413, "payload_too_large", "too many events in batch");
    }
    return ingestBatch(
      deps.pool,
      request.log,
      agent.agentHash,
      parsedBatch.data.events,
      parsedBatch.data.schemaVersion,
      parsedBatch.data.backfill,
    );
  });
};
