import type { FastifyPluginAsync } from "fastify";
import type { Deps } from "../../app.js";
import { toActivityRowDto, type ActivityFeedDto } from "../../public-dto.js";
import { visibleActivityPage, type ActivityDbRow, type FeedCursor } from "../../repos/read-repo.js";

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

export const activityRoutes: FastifyPluginAsync<Deps> = async (app, deps) => {
  app.get<{ Querystring: { cursor?: string } }>("/api/activity", async (request, reply) => {
    let cursor: FeedCursor | null = null;
    if (request.query.cursor !== undefined) {
      cursor = decodeCursor(request.query.cursor);
      if (cursor === null) {
        return reply.status(400).send({ error: { code: "invalid_cursor", message: "malformed cursor" } });
      }
    }
    const pageSize = deps.config.PUBLIC_FEED_PAGE_SIZE;
    const rows = await visibleActivityPage(deps.pool, cursor, pageSize + 1);
    const pageRows = rows.slice(0, pageSize);
    const lastRow = pageRows.at(-1);
    const feed: ActivityFeedDto = {
      items: pageRows.map((row) => toActivityRowDto(row, deps.resolveChain)),
      nextCursor: rows.length > pageSize && lastRow !== undefined ? encodeCursor(lastRow) : null,
    };
    return feed;
  });
};
