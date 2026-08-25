import type { FastifyPluginAsync } from "fastify";
import { resolveChartRange, type ChartRangePlan } from "@agentscan/core";
import type { ResolveChain, WiredDeps } from "../../app.js";
import type { TokenDetailDto, TokenListingDto, TokenStatDto } from "../../public-dto.js";
import { TtlCache } from "../../plugins/ttl-cache.js";
import {
  tokenChainCandidates,
  tokenDetail,
  tokenListing,
  type TokenChainCandidateRead,
  type TokenKey,
  type TokenListingCursor,
  type TokenStatRead,
} from "../../repos/token-repo.js";

function tokenPageLimitOf(raw: string | undefined, pageSize: number): number {
  const requested = Number(raw);
  if (!Number.isInteger(requested) || requested < 1) return pageSize;
  return Math.min(requested, pageSize);
}

function decodeTokenCursor(value: string): TokenListingCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      volumeUsd?: unknown;
      txCount?: unknown;
      address?: unknown;
      chainFamily?: unknown;
      chainId?: unknown;
    };
    if (typeof parsed.volumeUsd !== "string" || typeof parsed.txCount !== "number") return null;
    if (!Number.isInteger(parsed.txCount) || parsed.txCount < 0) return null;
    if (typeof parsed.address !== "string" || parsed.address.length === 0) return null;
    if (parsed.chainFamily !== "eip155" && parsed.chainFamily !== "solana") return null;
    if (typeof parsed.chainId !== "string" || !/^[0-9]+$/.test(parsed.chainId)) return null;
    return {
      volumeUsd: parsed.volumeUsd,
      txCount: parsed.txCount,
      address: parsed.address,
      chainFamily: parsed.chainFamily,
      chainId: parsed.chainId,
    };
  } catch {
    return null;
  }
}

function encodeTokenCursor(row: TokenStatRead): string {
  const payload = JSON.stringify({
    volumeUsd: row.volumeUsd,
    txCount: row.txCount,
    address: row.address,
    chainFamily: row.chainFamily,
    chainId: row.chainId.toString(),
  });
  return Buffer.from(payload, "utf8").toString("base64url");
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
  const listingCache = new TtlCache<TokenListingDto>(deps.config.READ_CACHE_TTL_SEC);
  const detailCache = new TtlCache<TokenDetailDto>(deps.config.READ_CACHE_TTL_SEC);

  app.get<{ Querystring: { range?: string; limit?: string; cursor?: string } }>(
    "/api/tokens",
    async (request, reply) => {
      let after: TokenListingCursor | null = null;
      if (request.query.cursor !== undefined) {
        after = decodeTokenCursor(request.query.cursor);
        if (after === null) {
          return reply.status(400).send({ error: { code: "invalid_cursor", message: "malformed cursor" } });
        }
      }
      const plan = resolveChartRange(request.query.range);
      const pageSize = tokenPageLimitOf(request.query.limit, deps.config.PUBLIC_TOKEN_PAGE_SIZE);
      reply.header("cache-control", `public, s-maxage=${deps.config.READ_CACHE_TTL_SEC}`);
      return listingCache.get(
        `tokens:${rangeKeyOf(plan)}:${pageSize}:${request.query.cursor ?? ""}`,
        async () => {
          const reads = await tokenListing(deps.pool, plan, pageSize + 1, after);
          const pageReads = reads.slice(0, pageSize);
          const last = pageReads.at(-1);
          return {
            items: listedTokens(pageReads, deps.resolveChain),
            nextCursor: reads.length > pageSize && last !== undefined ? encodeTokenCursor(last) : null,
          };
        },
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
