import type { FastifyPluginAsync } from "fastify";
import { resolveChartRange, type ChartRangePlan } from "@agentscan/core";
import { evmChains, solanaChains } from "../../../../../packages/core/src/chain-registry/chains.js";
import type { WiredDeps } from "../../app.js";
import type { NetworkDetailDto, NetworkStatDto } from "../../public-dto.js";
import { TtlCache } from "../../plugins/ttl-cache.js";
import {
  findRegistryNetwork,
  networkDetail,
  networkList,
  registryNetworks,
} from "../../repos/network-repo.js";

const networks = registryNetworks(evmChains, solanaChains);

function rangeKeyOf(plan: ChartRangePlan): string {
  if (plan.source === "activities") return `${plan.bucketSeconds}:${plan.bucketCount}`;
  return `days:${plan.days ?? "all"}`;
}

export const networksRoutes: FastifyPluginAsync<WiredDeps> = async (app, deps) => {
  const listCache = new TtlCache<NetworkStatDto[]>(deps.config.READ_CACHE_TTL_SEC);
  const detailCache = new TtlCache<NetworkDetailDto>(deps.config.READ_CACHE_TTL_SEC);

  app.get<{ Querystring: { range?: string } }>(
    "/api/networks",
    async (request, reply): Promise<NetworkStatDto[]> => {
      const plan = resolveChartRange(request.query.range);
      reply.header("cache-control", `public, s-maxage=${deps.config.READ_CACHE_TTL_SEC}`);
      return listCache.get(`networks:${rangeKeyOf(plan)}`, () =>
        networkList(deps.pool, { networks, plan, resolveBridgeChain: deps.resolveBridgeChain }),
      );
    },
  );

  app.get<{ Params: { slug: string }; Querystring: { range?: string } }>(
    "/api/networks/:slug",
    async (request, reply) => {
      const network = findRegistryNetwork(networks, request.params.slug.toLowerCase());
      if (network === null) {
        return reply.status(404).send({ error: { code: "not_found", message: "network not found" } });
      }
      const plan = resolveChartRange(request.query.range);
      reply.header("cache-control", `public, s-maxage=${deps.config.READ_CACHE_TTL_SEC}`);
      return detailCache.get(`network:${network.canonicalSlug}:${rangeKeyOf(plan)}`, () =>
        networkDetail(deps.pool, {
          network,
          plan,
          resolveBridgeChain: deps.resolveBridgeChain,
          panelRows: deps.config.PUBLIC_PANEL_ROWS,
        }),
      );
    },
  );
};
