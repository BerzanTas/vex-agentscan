import type { FastifyPluginAsync } from "fastify";
import { resolveChartRange, type ChartRangePlan } from "@agentscan/core";
import type { WiredDeps } from "../../app.js";
import type { BridgeRouteDto } from "../../public-dto.js";
import { TtlCache } from "../../plugins/ttl-cache.js";
import { bridgeRoutes } from "../../repos/route-repo.js";

function cacheKeyOf(plan: ChartRangePlan): string {
  if (plan.source === "activities") {
    return `routes:${plan.bucketSeconds * plan.bucketCount}`;
  }
  return `routes:${plan.days === null ? "all" : `${plan.days}d`}`;
}

export const bridgeRouteRoutes: FastifyPluginAsync<WiredDeps> = async (app, deps) => {
  const cache = new TtlCache<BridgeRouteDto[]>(deps.config.READ_CACHE_TTL_SEC);

  app.get<{ Querystring: { range?: string } }>(
    "/api/routes",
    async (request, reply): Promise<BridgeRouteDto[]> => {
      const plan = resolveChartRange(request.query.range);
      reply.header("cache-control", `public, s-maxage=${deps.config.READ_CACHE_TTL_SEC}`);
      return cache.get(cacheKeyOf(plan), () =>
        bridgeRoutes(deps.pool, plan, deps.resolveBridgeChain),
      );
    },
  );
};
