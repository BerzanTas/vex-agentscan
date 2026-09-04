/**
 * `PUT /v1/assets` and `DELETE /v1/assets/<cid>` - the two authenticated
 * writes, both owned by the install that made them.
 *
 * WHO MAY CALL. The credential is the one the ingest route uses: the install's
 * `agentHash` plus its handshake-minted ingest token, verified by
 * `@agentscan/install-identity`, which is the SAME code path - not a copy.
 *
 * WHAT REPORTING STATUS DOES NOT DECIDE (coordinator decision I1, "no coupling
 * to reporting consent"): an install whose AgentScan status is `revoked` or
 * `quarantined` may still upload and delete here. Those states are the
 * reporting stream's - `revoked` means "stop publishing my activity",
 * `quarantined` means "your events are suspect" - and neither is a statement
 * about token art. Coupling them would mean that withdrawing consent to
 * analytics silently removes the ability to launch a token with a picture, and
 * that a strike on the event stream blocks an unrelated money path. The bound
 * that actually protects this host is the per-install quota below, not a
 * consent flag. A revoked install is still an install we authenticated.
 *
 * ORDER OF OPERATIONS ON UPLOAD, and why:
 *  1. authenticate;
 *  2. read the part under the size cap, validate the BYTES (magic bytes,
 *     header dimensions) - the declared content-type is never read;
 *  3. derive the cid;
 *  4. inside one transaction, holding this install's upload lock:
 *     a tombstoned cid is refused permanently; a live cid is answered
 *     idempotently; otherwise the quota is checked, the bytes are published,
 *     and the row is inserted.
 * The bytes are written BEFORE the row because the row is what makes an asset
 * reachable: `GET /a/...` reads the row first, so a file with no row is
 * unreferenced, invisible, and reused by the next upload of the same bytes. A
 * row with no file would be the opposite - a promise the volume cannot keep.
 */

import type { FastifyPluginAsync } from "fastify";
import { authenticateInstall, bearerTokenFrom, type AuthenticatedInstall } from "@agentscan/install-identity";
import type { AssetsDeps } from "../app.js";
import { CID_PATTERN, contentIdOf, publicUrlFor } from "../content-address.js";
import { sendError } from "../error-envelope.js";
import { validateImageBytes } from "../image-bytes.js";
import { decideQuota } from "../quota.js";
import {
  assetRowFor,
  insertAssetRow,
  liveUsageFor,
  lockInstallUploads,
  markAssetDeleted,
  type AssetRow,
} from "../assets-repo.js";

type UploadAccepted = {
  readonly status: 200 | 201;
  readonly body: {
    cid: string;
    url: string;
    bytes: number;
    type: string;
    width: number;
    height: number;
  };
};

type UploadRefused = {
  readonly status: number;
  readonly code: string;
  readonly message: string;
};

type UploadOutcome =
  | ({ readonly kind: "accepted" } & UploadAccepted)
  | ({ readonly kind: "refused" } & UploadRefused);

const acceptedFrom = (row: AssetRow, publicBase: string, status: 200 | 201): UploadOutcome => ({
  kind: "accepted",
  status,
  body: {
    cid: row.cid,
    url: publicUrlFor(publicBase, row.cid, row.contentType),
    bytes: row.byteLength,
    type: row.contentType,
    width: row.width,
    height: row.height,
  },
});

const deletedRefusal: UploadRefused = {
  status: 410,
  code: "asset_deleted",
  message: "this content was deleted by its owner and cannot be published again",
};

export const uploadRoutes: FastifyPluginAsync<AssetsDeps> = async (app, deps) => {
  async function installFor(
    authorizationHeader: string | undefined,
  ): Promise<AuthenticatedInstall | null> {
    const bearerToken = bearerTokenFrom(authorizationHeader);
    if (bearerToken === null) return null;
    return authenticateInstall(deps.pool, bearerToken);
  }

  app.put("/v1/assets", async (request, reply) => {
    const install = await installFor(request.headers.authorization);
    if (install === null) {
      return sendError(request, reply, 401, "unauthorized", "missing, malformed or unknown install token");
    }

    const part = await request.file();
    if (part === undefined) {
      return sendError(request, reply, 400, "validation_failed", "expected one multipart file part");
    }
    if (part.fieldname !== "file") {
      return sendError(request, reply, 400, "validation_failed", "the file part must be named `file`");
    }
    // Throws FST_REQ_FILE_TOO_LARGE past the cap; the envelope answers 413.
    const bytes = await part.toBuffer();

    const verdict = validateImageBytes(bytes, deps.config.ASSETS_MAX_UPLOAD_BYTES);
    if (!verdict.ok) {
      const { rejection } = verdict;
      if (rejection.kind === "too_large") {
        return sendError(request, reply, 413, "payload_too_large", "the upload is larger than the cap");
      }
      if (rejection.kind === "too_small") {
        return sendError(request, reply, 400, "unsupported_image", "the upload is too small to be an image");
      }
      return sendError(request, reply, 400, "unsupported_image", rejection.reason);
    }

    const cid = contentIdOf(bytes);
    const outcome = await publishAsset(deps, install.agentHash, cid, bytes, verdict);
    if (outcome.kind === "refused") {
      request.log.warn(
        { agentHash: install.agentHash, cid, bytes: bytes.byteLength, outcome: outcome.code },
        "asset upload refused",
      );
      return sendError(request, reply, outcome.status, outcome.code, outcome.message);
    }
    request.log.info(
      {
        agentHash: install.agentHash,
        cid,
        bytes: bytes.byteLength,
        type: verdict.contentType,
        outcome: outcome.status === 201 ? "stored" : "idempotent",
      },
      "asset upload accepted",
    );
    return reply.status(outcome.status).send(outcome.body);
  });

  app.delete<{ Params: { cid: string } }>("/v1/assets/:cid", async (request, reply) => {
    const install = await installFor(request.headers.authorization);
    if (install === null) {
      return sendError(request, reply, 401, "unauthorized", "missing, malformed or unknown install token");
    }
    const { cid } = request.params;
    if (!CID_PATTERN.test(cid)) {
      return sendError(request, reply, 400, "validation_failed", "the path must name a content id");
    }
    const row = await assetRowFor(deps.pool, cid);
    if (row === null) {
      return sendError(request, reply, 404, "asset_not_found", "no asset is served at this address");
    }
    if (row.agentHash !== install.agentHash) {
      return sendError(request, reply, 403, "forbidden", "only the install that published an asset may delete it");
    }

    // The tombstone lands FIRST. From the moment it commits the public route
    // answers 404, so a failure to unlink leaves unreachable bytes for an
    // operator to sweep rather than a served asset the owner believes is gone.
    const newlyDeleted = await markAssetDeleted(deps.pool, cid, install.agentHash);
    await deps.store.remove(cid);
    request.log.info(
      { agentHash: install.agentHash, cid, outcome: newlyDeleted ? "deleted" : "already_deleted" },
      "asset delete",
    );
    return { cid, status: "deleted" as const };
  });
};

/**
 * The transactional half of an upload. Separated from the route so the
 * ordering rules above are one readable unit, and so the advisory lock's scope
 * is exactly the transaction and nothing more.
 */
async function publishAsset(
  deps: AssetsDeps,
  agentHash: string,
  cid: string,
  bytes: Buffer,
  verdict: Extract<ReturnType<typeof validateImageBytes>, { ok: true }>,
): Promise<UploadOutcome> {
  const publicBase = deps.config.ASSETS_PUBLIC_BASE;
  const client = await deps.pool.connect();
  try {
    await client.query("BEGIN");
    await lockInstallUploads(client, agentHash);

    const existing = await assetRowFor(client, cid);
    if (existing !== null) {
      await client.query("ROLLBACK");
      if (existing.deletedAt !== null) return { kind: "refused", ...deletedRefusal };
      // Identical bytes are one asset. Re-publishing them - by the install
      // that owns them or by another that happens to hold the same file - is
      // answered from the existing row, because a content-addressed store
      // cannot hold a second copy and refusing would deny a caller a URL that
      // already serves exactly the bytes it uploaded.
      return acceptedFrom(existing, publicBase, 200);
    }

    const usage = await liveUsageFor(client, agentHash);
    const quota = decideQuota(usage, quotaLimitsFrom(deps), bytes.byteLength);
    if (!quota.ok) {
      await client.query("ROLLBACK");
      return {
        kind: "refused",
        status: 429,
        code: quota.code,
        message: `install storage quota reached: ${quota.used} of ${quota.limit}`,
      };
    }

    await deps.store.put(cid, bytes);
    const inserted = await insertAssetRow(client, {
      cid,
      agentHash,
      contentType: verdict.contentType,
      byteLength: verdict.byteLength,
      width: verdict.width,
      height: verdict.height,
    });
    if (inserted === "taken") {
      // Another install committed this cid between our read and our write.
      // The bytes we just published are theirs and ours alike, so we answer
      // from whatever the winner recorded.
      await client.query("ROLLBACK");
      const winner = await assetRowFor(deps.pool, cid);
      if (winner === null) return { kind: "refused", ...deletedRefusal };
      if (winner.deletedAt !== null) return { kind: "refused", ...deletedRefusal };
      return acceptedFrom(winner, publicBase, 200);
    }
    await client.query("COMMIT");
    const row = await assetRowFor(deps.pool, cid);
    if (row === null) throw new Error("committed asset row disappeared");
    return acceptedFrom(row, publicBase, 201);
  } catch (cause) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw cause;
  } finally {
    client.release();
  }
}

function quotaLimitsFrom(deps: AssetsDeps): { maxAssets: number; maxBytes: number } {
  return {
    maxAssets: deps.config.ASSETS_MAX_PER_INSTALL,
    maxBytes: deps.config.ASSETS_MAX_BYTES_PER_INSTALL,
  };
}
