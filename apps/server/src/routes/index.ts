import type { FastifyPluginAsync } from "fastify";
import type { WiredDeps } from "../app.js";
import { healthRoutes } from "./health.js";
import { agentsRoutes } from "./agents.js";
import { eventsRoutes } from "./events.js";
import { statsRoutes } from "./public/stats.js";
import { chartRoutes } from "./public/chart.js";
import { protocolsRoutes } from "./public/protocols.js";
import { agentsRoutes as publicAgentsRoutes } from "./public/agents.js";
import { activityRoutes } from "./public/activity.js";
import { lookupRoutes } from "./public/lookup.js";
import { txRoutes } from "./public/tx.js";

export const routePlugins: FastifyPluginAsync<WiredDeps>[] = [
  healthRoutes,
  agentsRoutes,
  eventsRoutes,
  statsRoutes,
  chartRoutes,
  protocolsRoutes,
  publicAgentsRoutes,
  activityRoutes,
  lookupRoutes,
  txRoutes,
];
