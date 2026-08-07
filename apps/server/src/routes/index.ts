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
import { tokensRoutes } from "./public/tokens.js";
import { networksRoutes } from "./public/networks.js";
import { bridgeRouteRoutes } from "./public/routes.js";
import { verificationRoutes } from "./public/verification.js";
import { tokenAttestationsRoutes } from "./token-attestations.js";

export const routePlugins: FastifyPluginAsync<WiredDeps>[] = [
  healthRoutes,
  agentsRoutes,
  eventsRoutes,
  tokenAttestationsRoutes,
  statsRoutes,
  chartRoutes,
  protocolsRoutes,
  publicAgentsRoutes,
  activityRoutes,
  lookupRoutes,
  txRoutes,
  tokensRoutes,
  networksRoutes,
  bridgeRouteRoutes,
  verificationRoutes,
];
