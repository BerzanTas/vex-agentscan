import type { FastifyPluginAsync } from "fastify";
import type { Deps } from "../../app.js";
import type { StatsDto } from "../../public-dto.js";
import { TtlCache } from "../../plugins/ttl-cache.js";
import { aggregateTotals, countActiveAgents7d } from "../../repos/read-repo.js";

export const statsRoutes: FastifyPluginAsync<Deps> = async (app, deps) => {
  const cache = new TtlCache<StatsDto>(deps.config.READ_CACHE_TTL_SEC);

  app.get("/api/stats", async (_request, reply): Promise<StatsDto> => {
    reply.header("cache-control", `public, s-maxage=${deps.config.READ_CACHE_TTL_SEC}`);
    return cache.get("stats", async () => {
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
  });
};
