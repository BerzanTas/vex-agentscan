import type { FastifyPluginAsync } from "fastify";
import type { Deps } from "../app.js";
import { healthRoutes } from "./health.js";
import { agentsRoutes } from "./agents.js";
import { statsRoutes } from "./public/stats.js";
import { chartRoutes } from "./public/chart.js";
import { protocolsRoutes } from "./public/protocols.js";
import { activityRoutes } from "./public/activity.js";
import { txRoutes } from "./public/tx.js";

export const routePlugins: FastifyPluginAsync<Deps>[] = [
  healthRoutes,
  agentsRoutes,
  statsRoutes,
  chartRoutes,
  protocolsRoutes,
  activityRoutes,
  txRoutes,
];
