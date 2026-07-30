import type { FastifyPluginAsync } from "fastify";
import type { Deps } from "../../app.js";
import type { ProtocolStatDto } from "../../public-dto.js";

const protocolsRoutes: FastifyPluginAsync<Deps> = async (app, deps) => {
  app.get("/api/protocols", async (): Promise<ProtocolStatDto[]> => {
    const { protocolRanking } = await import("../../repos/read-repo.js");
    return protocolRanking(deps.pool);
  });
};

export default protocolsRoutes;
