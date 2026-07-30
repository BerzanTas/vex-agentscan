import type { FastifyPluginAsync } from "fastify";
import type { Deps } from "../../app.js";
import type { ChartPointDto } from "../../public-dto.js";
import { chartByDay } from "../../repos/read-repo.js";

const DEFAULT_CHART_DAYS = 30;

function chartDaysFrom(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_CHART_DAYS;
}

export const chartRoutes: FastifyPluginAsync<Deps> = async (app, deps) => {
  app.get<{ Querystring: { days?: string } }>("/api/chart", async (request): Promise<ChartPointDto[]> => {
    return chartByDay(deps.pool, chartDaysFrom(request.query.days));
  });
};
