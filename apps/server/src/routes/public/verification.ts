import type { FastifyPluginAsync } from "fastify";
import type { WiredDeps } from "../../app.js";
import type { ChainTierDto, VerificationStatsDto } from "../../public-dto.js";
import { TtlCache } from "../../plugins/ttl-cache.js";
import { verificationSummary } from "../../repos/verification-repo.js";
import {
  evmChains,
  solanaChains,
  type ChainEntry,
} from "../../../../../packages/core/src/chain-registry/chains.js";

function chainTierOf(entry: ChainEntry): ChainTierDto {
  return {
    chainSlug: entry.canonicalSlug,
    displayName: entry.displayName,
    verificationTier: entry.verificationTier,
  };
}

function registryChainTiers(): ChainTierDto[] {
  const entries = [...evmChains, ...solanaChains].map((chain) => chain.entry);
  const bySlug = new Map(entries.map((entry) => [entry.canonicalSlug, chainTierOf(entry)]));
  return [...bySlug.values()];
}

export const verificationRoutes: FastifyPluginAsync<WiredDeps> = async (app, deps) => {
  const cache = new TtlCache<VerificationStatsDto>(deps.config.READ_CACHE_TTL_SEC);
  const chains = registryChainTiers();

  app.get("/api/verification", async (_request, reply): Promise<VerificationStatsDto> => {
    reply.header("cache-control", `public, s-maxage=${deps.config.READ_CACHE_TTL_SEC}`);
    return cache.get("verification", async () => ({
      ...(await verificationSummary(deps.pool)),
      chains,
    }));
  });
};
