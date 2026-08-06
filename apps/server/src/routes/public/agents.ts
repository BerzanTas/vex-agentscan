import type { FastifyPluginAsync } from "fastify";
import { rangeWindowSeconds, resolveChartRange } from "@agentscan/core";
import type { Deps } from "../../app.js";
import { toAgentStatDto, type AgentStatDto } from "../../public-dto.js";
import { TtlCache } from "../../plugins/ttl-cache.js";
import { agentLeaderboard } from "../../repos/read-repo.js";

function cacheKeyOf(windowSeconds: number | null): string {
  return `agents:${windowSeconds ?? "all"}`;
}

export const agentsRoutes: FastifyPluginAsync<Deps> = async (app, deps) => {
  const cache = new TtlCache<AgentStatDto[]>(deps.config.READ_CACHE_TTL_SEC);

  app.get<{ Querystring: { range?: string } }>(
    "/api/agents",
    async (request, reply): Promise<AgentStatDto[]> => {
      const windowSeconds = rangeWindowSeconds(resolveChartRange(request.query.range));
      reply.header("cache-control", `public, s-maxage=${deps.config.READ_CACHE_TTL_SEC}`);
      return cache.get(cacheKeyOf(windowSeconds), async () => {
        const leaders = await agentLeaderboard(deps.pool, windowSeconds);
        return leaders.map((leader) => toAgentStatDto(deps.config.AGENT_ALIAS_SALT, leader));
      });
    },
  );
};
