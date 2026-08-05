import type { FastifyPluginAsync } from "fastify";
import type { Deps } from "../../app.js";
import { toAgentStatDto, type AgentStatDto } from "../../public-dto.js";
import { TtlCache } from "../../plugins/ttl-cache.js";
import { agentLeaderboard } from "../../repos/read-repo.js";

export const agentsRoutes: FastifyPluginAsync<Deps> = async (app, deps) => {
  const cache = new TtlCache<AgentStatDto[]>(deps.config.READ_CACHE_TTL_SEC);

  app.get("/api/agents", async (_request, reply): Promise<AgentStatDto[]> => {
    reply.header("cache-control", `public, s-maxage=${deps.config.READ_CACHE_TTL_SEC}`);
    return cache.get("agents", async () => {
      const leaders = await agentLeaderboard(deps.pool);
      return leaders.map((leader) => toAgentStatDto(deps.config.AGENT_ALIAS_SALT, leader));
    });
  });
};
