import type { FastifyPluginAsync } from "fastify";
import type { Deps } from "../../app.js";

const txRoutes: FastifyPluginAsync<Deps> = async (app, deps) => {
  app.get<{ Params: { publicId: string } }>("/api/tx/:publicId", async (request, reply) => {
    const [{ toTxDetailDto }, { visibleActivityByPublicId }] = await Promise.all([
      import("../../public-dto.js"),
      import("../../repos/read-repo.js"),
    ]);
    const row = await visibleActivityByPublicId(deps.pool, request.params.publicId);
    if (row === null) {
      return reply.status(404).send({ error: { code: "not_found", message: "activity not found" } });
    }
    return toTxDetailDto(row, deps.resolveChain);
  });
};

export default txRoutes;
