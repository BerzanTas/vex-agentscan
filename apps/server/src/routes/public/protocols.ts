import type { FastifyPluginAsync } from "fastify";
import type { Deps } from "../../app.js";
import type { ProtocolStatDto } from "../../public-dto.js";
import { protocolRanking } from "../../repos/read-repo.js";

export const protocolsRoutes: FastifyPluginAsync<Deps> = async (app, deps) => {
  app.get("/api/protocols", async (): Promise<ProtocolStatDto[]> => {
    return protocolRanking(deps.pool);
  });
};
