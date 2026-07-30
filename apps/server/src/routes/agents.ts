import { registerRequestSchema } from "@agentscan/contract";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { Deps } from "../app.js";
import { authenticateAgent, bearerTokenFrom, sha256Hex } from "../plugins/auth.js";
import { SlidingWindowLimiter } from "../plugins/rate-limit.js";
import { revokeAgent, upsertAgentRegistration } from "../repos/agents-repo.js";

const sendError = (reply: FastifyReply, status: number, code: string, message: string) =>
  reply.status(status).send({ error: { code, message } });

export const agentsRoutes: FastifyPluginAsync<Deps> = async (app, deps) => {
  const registerLimiter = new SlidingWindowLimiter(
    deps.config.REGISTER_RATE_LIMIT_PER_IP,
    deps.config.REGISTER_RATE_WINDOW_SEC,
  );

  app.post("/v1/agents/register", async (request, reply) => {
    const rateDecision = registerLimiter.allow(request.ip);
    if (!rateDecision.ok) {
      return reply
        .status(429)
        .header("retry-after", String(rateDecision.retryAfterSec))
        .send({ error: { code: "rate_limited", message: "too many register requests" } });
    }
    const parsed = registerRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, "validation_failed", "register body failed validation");
    }
    const outcome = await upsertAgentRegistration(deps.pool, {
      agentHash: parsed.data.agentHash,
      ingestTokenSha256: sha256Hex(parsed.data.ingestToken),
      consentVersion: parsed.data.consentVersion,
      acceptedAt: parsed.data.acceptedAt,
      appVersion: parsed.data.appVersion ?? null,
    });
    if (outcome === "token_conflict") {
      return sendError(reply, 409, "agent_conflict", "agent hash is bound to a different token");
    }
    return { status: "registered" };
  });

  app.post("/v1/agents/revoke", async (request, reply) => {
    const bearerToken = bearerTokenFrom(request.headers.authorization);
    if (!bearerToken) {
      return sendError(reply, 401, "unauthorized", "missing or malformed bearer token");
    }
    const agent = await authenticateAgent(deps.pool, bearerToken);
    if (!agent) {
      return sendError(reply, 401, "unauthorized", "unknown token");
    }
    await revokeAgent(deps.pool, agent.agentHash);
    return { status: "revoked" };
  });
};
