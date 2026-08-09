import type { FastifyPluginAsync } from "fastify";
import { rangeWindowSeconds, resolveChartRange } from "@agentscan/core";
import type { Deps } from "../../app.js";
import { toPricingCoverageDto, type PricingCoverageDto } from "../../public-dto.js";
import { TtlCache } from "../../plugins/ttl-cache.js";
import { pricingCoverage } from "../../repos/read-repo.js";

function cacheKeyOf(windowSeconds: number | null): string {
  return `pricing-coverage:${windowSeconds ?? "all"}`;
}

export const pricingCoverageRoutes: FastifyPluginAsync<Deps> = async (app, deps) => {
  const cache = new TtlCache<PricingCoverageDto>(deps.config.READ_CACHE_TTL_SEC);

  app.get<{ Querystring: { range?: string } }>(
    "/api/pricing-coverage",
    async (request, reply): Promise<PricingCoverageDto> => {
      const windowSeconds = rangeWindowSeconds(resolveChartRange(request.query.range));
      reply.header("cache-control", `public, s-maxage=${deps.config.READ_CACHE_TTL_SEC}`);
      return cache.get(cacheKeyOf(windowSeconds), async () =>
        toPricingCoverageDto(await pricingCoverage(deps.pool, windowSeconds)),
      );
    },
  );
};
