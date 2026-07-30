import type { FastifyPluginAsync } from "fastify";
import type { Deps } from "../../app.js";
import type { ChartPointDto } from "../../public-dto.js";

const DEFAULT_CHART_DAYS = 30;

function chartDaysFrom(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_CHART_DAYS;
}

const chartRoutes: FastifyPluginAsync<Deps> = async (app, deps) => {
  app.get<{ Querystring: { days?: string } }>("/api/chart", async (request): Promise<ChartPointDto[]> => {
    const { chartByDay } = await import("../../repos/read-repo.js");
    return chartByDay(deps.pool, chartDaysFrom(request.query.days));
  });
};

export default chartRoutes;
