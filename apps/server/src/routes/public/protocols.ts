import type { FastifyPluginAsync } from "fastify";
import type { Deps } from "../../app.js";
import type { ProtocolStatDto } from "../../public-dto.js";
import { TtlCache } from "../../plugins/ttl-cache.js";
import { protocolRanking } from "../../repos/read-repo.js";

export const protocolsRoutes: FastifyPluginAsync<Deps> = async (app, deps) => {
  const cache = new TtlCache<ProtocolStatDto[]>(deps.config.READ_CACHE_TTL_SEC);

  app.get("/api/protocols", async (_request, reply): Promise<ProtocolStatDto[]> => {
    reply.header("cache-control", `public, s-maxage=${deps.config.READ_CACHE_TTL_SEC}`);
    return cache.get("protocols", () => protocolRanking(deps.pool));
  });
};
