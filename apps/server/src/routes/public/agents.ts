import type { FastifyPluginAsync } from "fastify";
import { rangeWindowSeconds, resolveChartRange } from "@agentscan/core";
import type { Deps } from "../../app.js";
import {
  toAgentStatDto,
  type AgentLeaderboardDto,
  type AgentStatDto,
} from "../../public-dto.js";
import { TtlCache } from "../../plugins/ttl-cache.js";
import {
  agentLeaderboard,
  countLeaderboardAgents,
  type AgentLeaderboardCursor,
  type AgentVolumeRead,
} from "../../repos/read-repo.js";
import { publishedAgentNames } from "../../repos/agent-page-repo.js";

function cacheKeyOf(windowSeconds: number | null, pageSize: number, cursor: string | undefined): string {
  return `agents:${windowSeconds ?? "all"}:${pageSize}:${cursor ?? ""}`;
}

function decodeAgentCursor(value: string): AgentLeaderboardCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      volumeUsd?: unknown;
      agentHash?: unknown;
    };
    if (typeof parsed.volumeUsd !== "string" || typeof parsed.agentHash !== "string") return null;
    if (!/^[0-9a-f]{64}$/.test(parsed.agentHash)) return null;
    return { volumeUsd: parsed.volumeUsd, agentHash: parsed.agentHash };
  } catch {
    return null;
  }
}

function encodeAgentCursor(leader: AgentVolumeRead): string {
  const payload = JSON.stringify({ volumeUsd: leader.volumeUsd, agentHash: leader.agentHash });
  return Buffer.from(payload, "utf8").toString("base64url");
}

function agentPageLimitOf(raw: string | undefined, pageSize: number): number {
  const requested = Number(raw);
  if (!Number.isInteger(requested) || requested < 1) return pageSize;
  return Math.min(requested, pageSize);
}

async function toLeaderboardItems(
  salt: string,
  pool: Deps["pool"],
  leaders: AgentVolumeRead[],
): Promise<AgentStatDto[]> {
  const names = await publishedAgentNames(
    pool,
    leaders.map((leader) => leader.agentHash),
  );
  return leaders.map((leader) => toAgentStatDto(salt, leader, names.get(leader.agentHash) ?? null));
}

export const agentsRoutes: FastifyPluginAsync<Deps> = async (app, deps) => {
  const cache = new TtlCache<AgentLeaderboardDto>(deps.config.READ_CACHE_TTL_SEC);

  app.get<{ Querystring: { range?: string; cursor?: string; limit?: string } }>(
    "/api/agents",
    async (request, reply) => {
      let after: AgentLeaderboardCursor | null = null;
      if (request.query.cursor !== undefined) {
        after = decodeAgentCursor(request.query.cursor);
        if (after === null) {
          return reply.status(400).send({ error: { code: "invalid_cursor", message: "malformed cursor" } });
        }
      }
      const windowSeconds = rangeWindowSeconds(resolveChartRange(request.query.range));
      const pageSize = agentPageLimitOf(request.query.limit, deps.config.PUBLIC_AGENT_PAGE_SIZE);
      reply.header("cache-control", `public, s-maxage=${deps.config.READ_CACHE_TTL_SEC}`);
      return cache.get(cacheKeyOf(windowSeconds, pageSize, request.query.cursor), async () => {
        const [leaders, totalAllTime, totalInWindow] = await Promise.all([
          agentLeaderboard(deps.pool, windowSeconds, { limit: pageSize + 1, after }),
          countLeaderboardAgents(deps.pool, null),
          countLeaderboardAgents(deps.pool, windowSeconds),
        ]);
        const pageLeaders = leaders.slice(0, pageSize);
        const last = pageLeaders.at(-1);
        return {
          items: await toLeaderboardItems(deps.config.AGENT_ALIAS_SALT, deps.pool, pageLeaders),
          nextCursor: leaders.length > pageSize && last !== undefined ? encodeAgentCursor(last) : null,
          totalAllTime,
          totalInWindow,
        };
      });
    },
  );
};
