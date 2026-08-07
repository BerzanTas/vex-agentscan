import type { FastifyPluginAsync } from "fastify";
import { resolveChartRange, type ChartRangePlan } from "@agentscan/core";
import type { Deps } from "../../app.js";
import type { ChartPointDto } from "../../public-dto.js";
import { TtlCache } from "../../plugins/ttl-cache.js";
import { chartBuckets } from "../../repos/read-repo.js";

function cacheKeyOf(plan: ChartRangePlan): string {
  if (plan.source === "activities") {
    return `chart:activities:${plan.bucketSeconds}:${plan.bucketCount}`;
  }
  return `chart:aggregates:${plan.days}`;
}

export const chartRoutes: FastifyPluginAsync<Deps> = async (app, deps) => {
  const cache = new TtlCache<ChartPointDto[]>(deps.config.READ_CACHE_TTL_SEC);

  app.get<{ Querystring: { range?: string } }>(
    "/api/chart",
    async (request, reply): Promise<ChartPointDto[]> => {
      const plan = resolveChartRange(request.query.range);
      reply.header("cache-control", `public, s-maxage=${deps.config.READ_CACHE_TTL_SEC}`);
      return cache.get(cacheKeyOf(plan), () => chartBuckets(deps.pool, plan));
    },
  );
};
