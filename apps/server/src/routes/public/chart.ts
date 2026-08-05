import type { FastifyPluginAsync } from "fastify";
import type { Deps } from "../../app.js";
import type { ChartPointDto } from "../../public-dto.js";
import { TtlCache } from "../../plugins/ttl-cache.js";
import { chartByDay } from "../../repos/read-repo.js";

const DEFAULT_CHART_DAYS = 30;
const MAX_CHART_DAYS = 365;

function chartDaysFrom(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_CHART_DAYS;
  return Math.min(parsed, MAX_CHART_DAYS);
}

export const chartRoutes: FastifyPluginAsync<Deps> = async (app, deps) => {
  const cache = new TtlCache<ChartPointDto[]>(deps.config.READ_CACHE_TTL_SEC);

  app.get<{ Querystring: { days?: string } }>(
    "/api/chart",
    async (request, reply): Promise<ChartPointDto[]> => {
      const days = chartDaysFrom(request.query.days);
      reply.header("cache-control", `public, s-maxage=${deps.config.READ_CACHE_TTL_SEC}`);
      return cache.get(`chart:${days}`, () => chartByDay(deps.pool, days));
    },
  );
};
