import type { FastifyPluginAsync } from "fastify";
import type { Deps } from "../../app.js";
import type { StatsDto } from "../../public-dto.js";
import { aggregateTotals, countActiveAgents7d } from "../../repos/read-repo.js";

export const statsRoutes: FastifyPluginAsync<Deps> = async (app, deps) => {
  app.get("/api/stats", async (): Promise<StatsDto> => {
    const [totals, activeAgents7d] = await Promise.all([
      aggregateTotals(deps.pool),
      countActiveAgents7d(deps.pool),
    ]);
    return {
      dailyVolumeUsd: totals.dailyVolumeUsd,
      totalVolumeUsd: totals.totalVolumeUsd,
      dailyTx: totals.dailyTx,
      totalTx: totals.totalTx,
      activeAgents7d,
    };
  });
};
