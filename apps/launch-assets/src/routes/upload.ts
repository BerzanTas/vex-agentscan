/**
 * `PUT /v1/assets` and `DELETE /v1/assets/<cid>` - the two authenticated
 * writes, both owned by the install that made them.
 *
 * WHO MAY CALL. The credential is the one the ingest route uses: the install's
 * `agentHash` plus its handshake-minted ingest token, verified by
 * `@agentscan/install-identity`, which is the SAME code path - not a copy.
 *
 * THE BODY IS THE IMAGE. There is no multipart envelope: the only client is
 * the Vex main process sending one buffer, so the request body IS the bytes
 * and `Content-Type` selects nothing but the parser. A multipart parser on a
 * trust boundary that nothing needs is ownership without benefit, and Fastify's
 * own `bodyLimit` refuses an oversized request without buffering past the cap,
 * which is the property busboy was there for.
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
 *  2. validate the BYTES (magic bytes, header dimensions) - the declared
 *     content-type is never read;
 *  3. derive the cid;
 *  4. inside one transaction, holding this install's lock and then this cid's:
 *     a tombstoned cid is refused permanently; an install that already
 *     publishes these bytes is answered idempotently; a NEW publisher of
 *     existing bytes is quota-checked and gains a claim; otherwise the quota
 *     is checked, the bytes are published, and the asset row plus the first
 *     claim are inserted.
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
import { validateImageBytes, type AssetContentType } from "../image-bytes.js";
import { decideQuota, type QuotaDecision } from "../quota.js";
import {
  assetRowFor,
  deletePublisher,
  insertAssetRow,
  insertPublisher,
  isPublisher,
  liveUsageFor,
  lockContentId,
  lockInstallUploads,
  markAssetDeleted,
  publisherCountFor,
} from "../assets-repo.js";

/** Everything a response body is built from. Both a stored row and a fresh verdict carry it. */
type AssetFacts = {
  readonly cid: string;
  readonly contentType: AssetContentType;
  readonly byteLength: number;
  readonly width: number;
  readonly height: number;
};

/** How an accepted upload ended, for the log line and for the status code. */
type UploadDisposition = "stored" | "claimed" | "idempotent";

type UploadOutcome =
  | {
      readonly kind: "accepted";
      readonly disposition: UploadDisposition;
      readonly status: 200 | 201;
      readonly body: {
        cid: string;
        url: string;
        bytes: number;
        type: string;
        width: number;
        height: number;
      };
    }
  | {
      readonly kind: "refused";
      readonly status: number;
      readonly code: string;
      readonly message: string;
    };

const acceptedFrom = (
  facts: AssetFacts,
  publicBase: string,
  disposition: UploadDisposition,
): UploadOutcome => ({
  kind: "accepted",
  disposition,
  status: disposition === "stored" ? 201 : 200,
  body: {
    cid: facts.cid,
    url: publicUrlFor(publicBase, facts.cid, facts.contentType),
    bytes: facts.byteLength,
    type: facts.contentType,
    width: facts.width,
    height: facts.height,
  },
});

const deletedRefusal = {
  kind: "refused",
  status: 410,
  code: "asset_deleted",
  message: "this content was withdrawn by its last publisher and cannot be published again",
} as const satisfies UploadOutcome;

const quotaRefusal = (quota: Extract<QuotaDecision, { ok: false }>): UploadOutcome => ({
  kind: "refused",
  status: 429,
  code: quota.code,
  message: `install storage quota reached: ${quota.used} of ${quota.limit}`,
});

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

    // The content-type parsers registered in `app.ts` yield a Buffer for every
    // type this route accepts, and Fastify answers 415 for the rest before the
    // handler runs. An empty body still reaches here, and is refused by name.
    const bytes = request.body;
    if (!Buffer.isBuffer(bytes) || bytes.byteLength === 0) {
      return sendError(request, reply, 400, "validation_failed", "expected the image bytes as the request body");
    }

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
        outcome: outcome.disposition,
      },
      "asset upload accepted",
    );
    return reply.status(outcome.status).send(outcome.body);
  });

  /**
   * Withdraw THIS install's claim on an asset. It is not a delete of the
   * asset: bytes other installs still publish stay served, and only the
   * withdrawal of the LAST claim tombstones the cid and unlinks the file.
   */
  app.delete<{ Params: { cid: string } }>("/v1/assets/:cid", async (request, reply) => {
    const install = await installFor(request.headers.authorization);
    if (install === null) {
      return sendError(request, reply, 401, "unauthorized", "missing, malformed or unknown install token");
    }
    const { cid } = request.params;
    if (!CID_PATTERN.test(cid)) {
      return sendError(request, reply, 400, "validation_failed", "the path must name a content id");
    }

    const outcome = await withdrawClaim(deps, install.agentHash, cid);
    if (outcome.kind === "refused") {
      return sendError(request, reply, outcome.status, outcome.code, outcome.message);
    }
    // The tombstone lands FIRST, in the committed transaction above. From the
    // moment it commits the public route answers 404, so a failure to unlink
    // leaves unreachable bytes for an operator to sweep rather than a served
    // asset the owner believes is gone.
    if (outcome.tombstoned) await deps.store.remove(cid);
    request.log.info(
      { agentHash: install.agentHash, cid, outcome: outcome.disposition },
      "asset delete",
    );
    return { cid, status: "deleted" as const };
  });
};

/**
 * The transactional half of an upload. Separated from the route so the
 * ordering rules above are one readable unit, and so the advisory locks' scope
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
  const limits = {
    maxAssets: deps.config.ASSETS_MAX_PER_INSTALL,
    maxBytes: deps.config.ASSETS_MAX_BYTES_PER_INSTALL,
  };
  const client = await deps.pool.connect();
  try {
    await client.query("BEGIN");
    await lockInstallUploads(client, agentHash);
    await lockContentId(client, cid);

    const existing = await assetRowFor(client, cid);
    if (existing !== null) {
      if (existing.deletedAt !== null) {
        await client.query("ROLLBACK");
        return deletedRefusal;
      }
      // Identical bytes are one asset. An install that already publishes them
      // is answered from the row - re-uploading is idempotent and costs no
      // quota, because it adds nothing to the volume.
      if (await isPublisher(client, cid, agentHash)) {
        await client.query("ROLLBACK");
        return acceptedFrom(existing, publicBase, "idempotent");
      }
      // A DIFFERENT install holding the same file gets a claim of its own, not
      // a copy: refusing would deny a caller a URL that already serves exactly
      // the bytes it uploaded. The claim is quota-bearing, because from here on
      // this install is one of the reasons these bytes stay on the volume.
      const quota = decideQuota(await liveUsageFor(client, agentHash), limits, existing.byteLength);
      if (!quota.ok) {
        await client.query("ROLLBACK");
        return quotaRefusal(quota);
      }
      await insertPublisher(client, cid, agentHash);
      await client.query("COMMIT");
      return acceptedFrom(existing, publicBase, "claimed");
    }

    const quota = decideQuota(await liveUsageFor(client, agentHash), limits, bytes.byteLength);
    if (!quota.ok) {
      await client.query("ROLLBACK");
      return quotaRefusal(quota);
    }

    await deps.store.put(cid, bytes);
    const facts = {
      cid,
      contentType: verdict.contentType,
      byteLength: verdict.byteLength,
      width: verdict.width,
      height: verdict.height,
    };
    await insertAssetRow(client, { ...facts, firstPublisherHash: agentHash });
    await insertPublisher(client, cid, agentHash);
    await client.query("COMMIT");
    return acceptedFrom(facts, publicBase, "stored");
  } catch (cause) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw cause;
  } finally {
    client.release();
  }
}

type WithdrawOutcome =
  | {
      readonly kind: "withdrawn";
      readonly disposition: "deleted" | "claim_withdrawn" | "already_deleted";
      readonly tombstoned: boolean;
    }
  | { readonly kind: "refused"; readonly status: number; readonly code: string; readonly message: string };

/**
 * The transactional half of a withdrawal, under this cid's lock so a
 * concurrent upload cannot add a claim between the count and the tombstone.
 */
async function withdrawClaim(
  deps: AssetsDeps,
  agentHash: string,
  cid: string,
): Promise<WithdrawOutcome> {
  const client = await deps.pool.connect();
  try {
    await client.query("BEGIN");
    await lockContentId(client, cid);

    const row = await assetRowFor(client, cid);
    if (row === null) {
      await client.query("ROLLBACK");
      return {
        kind: "refused",
        status: 404,
        code: "asset_not_found",
        message: "no asset is served at this address",
      };
    }
    if (row.deletedAt !== null) {
      // Already withdrawn by its last publisher, and withdrawal is permanent
      // for everyone. There are no claims left to check, so this answers the
      // caller's intent - "this must not be served" - rather than 403-ing on a
      // claim the tombstone already erased.
      await client.query("ROLLBACK");
      return { kind: "withdrawn", disposition: "already_deleted", tombstoned: false };
    }
    if (!(await deletePublisher(client, cid, agentHash))) {
      await client.query("ROLLBACK");
      return {
        kind: "refused",
        status: 403,
        code: "forbidden",
        message: "only an install that published an asset may withdraw it",
      };
    }
    const remaining = await publisherCountFor(client, cid);
    if (remaining > 0) {
      await client.query("COMMIT");
      return { kind: "withdrawn", disposition: "claim_withdrawn", tombstoned: false };
    }
    await markAssetDeleted(client, cid);
    await client.query("COMMIT");
    return { kind: "withdrawn", disposition: "deleted", tombstoned: true };
  } catch (cause) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw cause;
  } finally {
    client.release();
  }
}
