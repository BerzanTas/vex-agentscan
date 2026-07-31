import type { FastifyPluginAsync } from "fastify";
import type { Deps } from "../../app.js";
import { toAgentStatDto, type AgentStatDto } from "../../public-dto.js";
import { agentLeaderboard } from "../../repos/read-repo.js";

export const agentsRoutes: FastifyPluginAsync<Deps> = async (app, deps) => {
  app.get("/api/agents", async (): Promise<AgentStatDto[]> => {
    const leaders = await agentLeaderboard(deps.pool);
    return leaders.map((leader) => toAgentStatDto(deps.config.AGENT_ALIAS_SALT, leader));
  });
};
