import type { FastifyPluginAsync } from "fastify";
import { chainKeysForSlug } from "@agentscan/core";
import type { WiredDeps } from "../../app.js";
import { toActivityRowDto, type ActivityFeedDto } from "../../public-dto.js";
import {
  parseActivityFilters,
  visibleActivityPage,
  type ActivityDbRow,
  type ChainFilterPairs,
  type FeedCursor,
  type RawActivityFilters,
} from "../../repos/read-repo.js";

function decodeCursor(value: string): FeedCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      receivedAt: string;
      id: string;
    };
    const receivedAt = new Date(parsed.receivedAt);
    if (Number.isNaN(receivedAt.getTime())) return null;
    return { receivedAt, id: BigInt(parsed.id) };
  } catch {
    return null;
  }
}

function encodeCursor(row: ActivityDbRow): string {
  const payload = JSON.stringify({ receivedAt: row.received_at.toISOString(), id: row.id.toString() });
  return Buffer.from(payload, "utf8").toString("base64url");
}

function chainFilterPairsOf(canonicalSlug: string): ChainFilterPairs | null {
  const [first, ...rest] = chainKeysForSlug(canonicalSlug).map(({ chainFamily, chainId }) => ({
    chainFamily,
    chainId,
  }));
  return first === undefined ? null : [first, ...rest];
}

type ActivityQuerystring = RawActivityFilters & { cursor?: string };

export const activityRoutes: FastifyPluginAsync<WiredDeps> = async (app, deps) => {
  app.get<{ Querystring: ActivityQuerystring }>("/api/activity", async (request, reply) => {
    let cursor: FeedCursor | null = null;
    if (request.query.cursor !== undefined) {
      cursor = decodeCursor(request.query.cursor);
      if (cursor === null) {
        return reply.status(400).send({ error: { code: "invalid_cursor", message: "malformed cursor" } });
      }
    }
    const filters = parseActivityFilters(request.query);
    const chainPairs = filters.chain === null ? null : chainFilterPairsOf(filters.chain);
    const pageSize = deps.config.PUBLIC_FEED_PAGE_SIZE;
    const rows = await visibleActivityPage(deps.pool, {
      cursor,
      limit: pageSize + 1,
      kind: filters.kind,
      protocol: filters.protocol,
      chainPairs,
      status: filters.status,
      verification: filters.verification,
    });
    const pageRows = rows.slice(0, pageSize);
    const lastRow = pageRows.at(-1);
    const feed: ActivityFeedDto = {
      items: pageRows.map((row) => toActivityRowDto(row, deps.resolveChain, deps.resolveBridgeChain)),
      nextCursor: rows.length > pageSize && lastRow !== undefined ? encodeCursor(lastRow) : null,
    };
    return feed;
  });
};
