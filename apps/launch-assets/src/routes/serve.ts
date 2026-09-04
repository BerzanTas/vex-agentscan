/**
 * `GET|HEAD /a/<cid>.<ext>` - the public, immutable read.
 *
 * THE URL IS THE PROMISE. A cid names one sequence of bytes forever, so the
 * response is cached `immutable` for a year and carries the cid as its ETag.
 * That is the property the launch approval leans on: what the user saw when
 * they approved is what every later viewer gets, and no revalidation is needed
 * to be sure of it.
 *
 * FOUR WAYS TO GET A 404, all the same answer on purpose:
 *  - the name is not `<64 hex>.<ext>`;
 *  - no row exists for the cid;
 *  - the row is tombstoned (the owner withdrew it, permanently);
 *  - the extension is not the canonical one for the stored type.
 * The last is what keeps the address canonical: `<cid>.png` for a JPEG is a
 * URL this host never minted, and answering it would create a second address
 * for one asset. There is no redirect, because a redirect would make the
 * second address work.
 *
 * NO DIRECTORY LISTING EXISTS. This is a route with a parameter, not a static
 * file server rooted at the store, so there is nothing to enumerate.
 */

import type { FastifyPluginAsync } from "fastify";
import type { AssetsDeps } from "../app.js";
import { extensionFor, parseAssetName } from "../content-address.js";
import { sendError } from "../error-envelope.js";
import { assetRowFor } from "../assets-repo.js";

const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

export const serveRoutes: FastifyPluginAsync<AssetsDeps> = async (app, deps) => {
  app.get<{ Params: { fileName: string } }>("/a/:fileName", async (request, reply) => {
    const notFound = () =>
      sendError(request, reply, 404, "asset_not_found", "no asset is served at this address");

    const parsed = parseAssetName(request.params.fileName);
    if (parsed === null) return notFound();

    const row = await assetRowFor(deps.pool, parsed.cid);
    if (row === null || row.deletedAt !== null) return notFound();
    if (parsed.extension !== extensionFor(row.contentType)) return notFound();

    const etag = `"${row.cid}"`;
    reply
      .header("cache-control", IMMUTABLE_CACHE_CONTROL)
      .header("etag", etag)
      .header("content-type", row.contentType)
      // Inline is safe next to `nosniff` and `default-src 'none'`, and it is
      // what an <img> pointing here needs. The filename is the cid, never
      // anything a user typed.
      .header("content-disposition", `inline; filename="${row.cid}.${parsed.extension}"`);

    if (request.headers["if-none-match"] === etag) return reply.status(304).send();

    const bytes = await deps.store.read(row.cid);
    if (bytes === null) {
      // The row says served, the volume says otherwise. That is an operator
      // incident, not a reader's mistake, so it is logged loudly and answered
      // as unavailable rather than as "deleted".
      request.log.error({ cid: row.cid }, "asset row has no bytes on the volume");
      return sendError(request, reply, 503, "asset_unavailable", "the asset store is degraded");
    }
    return reply.header("content-length", String(bytes.byteLength)).send(bytes);
  });
};
