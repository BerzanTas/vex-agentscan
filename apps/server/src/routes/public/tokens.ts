import type { FastifyPluginAsync } from "fastify";
import { resolveChartRange, type ChartRangePlan } from "@agentscan/core";
import type { ResolveChain, WiredDeps } from "../../app.js";
import type { TokenDetailDto, TokenStatDto } from "../../public-dto.js";
import { TtlCache } from "../../plugins/ttl-cache.js";
import {
  tokenChainCandidates,
  tokenDetail,
  tokenListing,
  type TokenChainCandidateRead,
  type TokenKey,
  type TokenStatRead,
} from "../../repos/token-repo.js";


function tokenRowLimitOf(raw: string | undefined, maxRows: number): number {
  const requested = Number(raw);
  if (!Number.isInteger(requested) || requested < 1) return maxRows;
  return Math.min(requested, maxRows);
}

function rangeKeyOf(plan: ChartRangePlan): string {
  if (plan.source === "activities") {
    return `activities:${plan.bucketSeconds}:${plan.bucketCount}`;
  }
  return `aggregates:${plan.days}`;
}

type ChainCoordinates = { chainFamily: string; chainId: bigint; protocols: string[] };

function chainSlugOf(coordinates: ChainCoordinates, resolveChain: ResolveChain): string | null {
  const chainFamily = coordinates.chainFamily === "solana" ? "solana" : "eip155";
  for (const protocol of coordinates.protocols) {
    const entry = resolveChain({ protocol, chainFamily, chainId: coordinates.chainId });
    if (entry !== null) return entry.canonicalSlug;
  }
  return null;
}

function listedTokens(reads: TokenStatRead[], resolveChain: ResolveChain): TokenStatDto[] {
  const listed: TokenStatDto[] = [];
  for (const read of reads) {
    const chainSlug = chainSlugOf(read, resolveChain);
    if (chainSlug === null) continue;
    listed.push({
      chainSlug,
      address: read.address,
      symbol: read.symbol,
      volumeUsd: read.volumeUsd,
      txCount: read.txCount,
      agentCount: read.agentCount,
      protocols: read.protocols,
      lastSeenSeconds: read.lastSeenSeconds,
      series: read.series,
    });
  }
  return listed;
}

function tokenKeyOn(
  candidates: TokenChainCandidateRead[],
  chainSlug: string,
  address: string,
  resolveChain: ResolveChain,
): TokenKey | null {
  for (const candidate of candidates) {
    if (chainSlugOf(candidate, resolveChain) !== chainSlug) continue;
    return { chainFamily: candidate.chainFamily, chainId: candidate.chainId, address };
  }
  return null;
}

export const tokensRoutes: FastifyPluginAsync<WiredDeps> = async (app, deps) => {
  const listingCache = new TtlCache<TokenStatDto[]>(deps.config.READ_CACHE_TTL_SEC);
  const detailCache = new TtlCache<TokenDetailDto>(deps.config.READ_CACHE_TTL_SEC);

  app.get<{ Querystring: { range?: string; limit?: string } }>(
    "/api/tokens",
    async (request, reply): Promise<TokenStatDto[]> => {
      const plan = resolveChartRange(request.query.range);
      const limit = tokenRowLimitOf(request.query.limit, deps.config.PUBLIC_TOKEN_ROWS_MAX);
      reply.header("cache-control", `public, s-maxage=${deps.config.READ_CACHE_TTL_SEC}`);
      return listingCache.get(`tokens:${rangeKeyOf(plan)}:${limit}`, async () =>
        listedTokens(await tokenListing(deps.pool, plan, limit), deps.resolveChain),
      );
    },
  );

  app.get<{ Params: { chainSlug: string; address: string }; Querystring: { range?: string } }>(
    "/api/tokens/:chainSlug/:address",
    async (request, reply) => {
      const address = request.params.address.toLowerCase();
      const candidates = await tokenChainCandidates(deps.pool, address);
      const key = tokenKeyOn(candidates, request.params.chainSlug, address, deps.resolveChain);
      if (key === null) {
        return reply.status(404).send({ error: { code: "not_found", message: "token not found" } });
      }
      const plan = resolveChartRange(request.query.range);
      reply.header("cache-control", `public, s-maxage=${deps.config.READ_CACHE_TTL_SEC}`);
      return detailCache.get(
        `token:${key.chainFamily}:${key.chainId}:${key.address}:${rangeKeyOf(plan)}`,
        async () => ({
          chainSlug: request.params.chainSlug,
          address,
          ...(await tokenDetail(deps.pool, plan, key, deps.config.PUBLIC_PANEL_ROWS)),
        }),
      );
    },
  );
};
