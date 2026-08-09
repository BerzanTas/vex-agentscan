import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { WiredDeps } from "../../app.js";
import { toAgentPageDto, type AgentPageDto } from "../../agent-page-dto.js";
import { TtlCache } from "../../plugins/ttl-cache.js";
import { agentPageActivities, publishedAgent } from "../../repos/agent-page-repo.js";

function agentNotFound(reply: FastifyReply): FastifyReply {
  return reply.status(404).send({ error: { code: "not_found", message: "agent not found" } });
}

export const agentPageRoutes: FastifyPluginAsync<WiredDeps> = async (app, deps) => {
  const cache = new TtlCache<AgentPageDto | null>(deps.config.READ_CACHE_TTL_SEC);

  app.get<{ Params: { name: string } }>("/api/agents/:name", async (request, reply) => {
    const name = request.params.name;
    const agent = await publishedAgent(deps.pool, name);
    if (agent === null) return agentNotFound(reply);

    const page = await cache.get(`agent-page:${name}`, async () => {
      const window = await agentPageActivities(
        deps.pool,
        agent.agentHash,
        deps.config.PUBLIC_AGENT_ROWS_MAX,
      );
      if (window.activities.length === 0) return null;
      return toAgentPageDto(
        {
          name,
          activities: window.activities,
          firstObservedAtSeconds: agent.firstObservedAtSeconds,
          truncated: window.truncated,
          minimumRoundTrips: deps.config.WIN_RATE_MIN_ROUND_TRIPS,
          nowSeconds: Math.floor(Date.now() / 1000),
        },
        deps.resolveChain,
      );
    });
    if (page === null) return agentNotFound(reply);

    reply.header("cache-control", `public, s-maxage=${deps.config.READ_CACHE_TTL_SEC}`);
    return page;
  });
};
