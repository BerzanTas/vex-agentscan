import type { FastifyPluginAsync } from "fastify";
import type { WiredDeps } from "../../app.js";
import { toTxDetailDto } from "../../public-dto.js";
import { visibleActivityByPublicId } from "../../repos/read-repo.js";

export const txRoutes: FastifyPluginAsync<WiredDeps> = async (app, deps) => {
  app.get<{ Params: { publicId: string } }>("/api/tx/:publicId", async (request, reply) => {
    const row = await visibleActivityByPublicId(deps.pool, request.params.publicId);
    if (row === null) {
      return reply.status(404).send({ error: { code: "not_found", message: "activity not found" } });
    }
    return toTxDetailDto(row, deps.resolveChain, deps.resolveBridgeChain);
  });
};
