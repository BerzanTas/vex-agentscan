import type { FastifyPluginAsync } from "fastify";
import type { Deps } from "../../app.js";
import type { LookupDto } from "../../public-dto.js";
import { lookupPublicId } from "../../repos/read-repo.js";

export const lookupRoutes: FastifyPluginAsync<Deps> = async (app, deps) => {
  app.get<{ Querystring: { q?: string } }>("/api/lookup", async (request, reply) => {
    const query = request.query.q;
    const publicId = query === undefined ? null : await lookupPublicId(deps.pool, query);
    if (publicId === null) {
      return reply.status(404).send({ error: { code: "not_found", message: "activity not found" } });
    }
    const dto: LookupDto = { publicId };
    return dto;
  });
};
