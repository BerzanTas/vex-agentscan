import type { FastifyPluginAsync } from "fastify";
import { rangeWindowSeconds, resolveChartRange } from "@agentscan/core";
import type { WiredDeps } from "../../app.js";
import type { ProtocolRankingDto, ProtocolStatDto } from "../../public-dto.js";
import { TtlCache } from "../../plugins/ttl-cache.js";
import { protocolRanking, protocolTotals } from "../../repos/read-repo.js";

function rankingCacheKeyOf(windowSeconds: number | null): string {
  return `protocol-ranking:${windowSeconds ?? "all"}`;
}

export const protocolsRoutes: FastifyPluginAsync<WiredDeps> = async (app, deps) => {
  const totalsCache = new TtlCache<ProtocolStatDto[]>(deps.config.READ_CACHE_TTL_SEC);
  const rankingCache = new TtlCache<ProtocolRankingDto[]>(deps.config.READ_CACHE_TTL_SEC);

  app.get("/api/protocols", async (_request, reply): Promise<ProtocolStatDto[]> => {
    reply.header("cache-control", `public, s-maxage=${deps.config.READ_CACHE_TTL_SEC}`);
    return totalsCache.get("protocols", () => protocolTotals(deps.pool));
  });

  app.get<{ Querystring: { range?: string } }>(
    "/api/protocols/ranking",
    async (request, reply): Promise<ProtocolRankingDto[]> => {
      const windowSeconds = rangeWindowSeconds(resolveChartRange(request.query.range));
      reply.header("cache-control", `public, s-maxage=${deps.config.READ_CACHE_TTL_SEC}`);
      return rankingCache.get(rankingCacheKeyOf(windowSeconds), () =>
        protocolRanking(deps.pool, windowSeconds),
      );
    },
  );
};
