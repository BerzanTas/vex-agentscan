/**
 * CONTENT ADDRESSING - the identity of every asset this host serves.
 *
 * The `cid` is the lowercase-hex sha256 of the EXACT bytes uploaded. That one
 * decision is why the launch flow can put this URL on chain: the approval the
 * user signs names a URL whose bytes cannot later change, because different
 * bytes are a different URL. The plan's rejected alternative - a mutable
 * public URL supplied by the user - had exactly that hole.
 *
 * Everything else here is derived from the cid and nothing here touches the
 * disk or the database, so the whole addressing scheme is testable as pure
 * arithmetic on a hash.
 */

import { createHash } from "node:crypto";
import type { AssetContentType } from "./image-bytes.js";

/** 64 lowercase hex characters. Anchored: a cid is never a path segment of our choosing. */
export const CID_PATTERN = /^[0-9a-f]{64}$/;

/** sha256 of the stored bytes, lowercase hex. The asset's whole identity. */
export function contentIdOf(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * ONE canonical extension per stored type, and the mapping is a total
 * function in both directions. A JPEG is always `.jpg`, never `.jpeg`: the
 * URL that goes on chain has to be the one URL this host will serve, so a
 * second spelling of the same asset is a second identity we would have to
 * keep honest forever.
 */
const EXTENSION_BY_CONTENT_TYPE = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
} as const satisfies Record<AssetContentType, string>;

export type AssetExtension = (typeof EXTENSION_BY_CONTENT_TYPE)[AssetContentType];

export function extensionFor(contentType: AssetContentType): AssetExtension {
  return EXTENSION_BY_CONTENT_TYPE[contentType];
}

export type ParsedAssetName = { readonly cid: string; readonly extension: string };

/**
 * Split `<cid>.<ext>` out of the public path. Returns `null` for anything that
 * is not exactly that shape - a traversal attempt, a bare cid, a double
 * extension - so the caller never has to reason about a partially valid name.
 * The slice here is a PARSE, not a bound: no content is being hidden.
 */
export function parseAssetName(fileName: string): ParsedAssetName | null {
  const dotIndex = fileName.indexOf(".");
  if (dotIndex === -1) return null;
  const cid = fileName.slice(0, dotIndex);
  const extension = fileName.slice(dotIndex + 1);
  if (!CID_PATTERN.test(cid)) return null;
  if (!/^[a-z0-9]{1,8}$/.test(extension)) return null;
  return { cid, extension };
}

/** The public URL an install stores beside its image row, and puts on chain. */
export function publicUrlFor(publicBase: string, cid: string, contentType: AssetContentType): string {
  return `${publicBase}/a/${cid}.${extensionFor(contentType)}`;
}

/**
 * TWO LEVELS OF SHARDING, from the first four hex characters: `ab/cd/<cid>`.
 * A single flat directory of hundreds of thousands of files is slow to stat
 * and miserable to back up; two levels give 65536 buckets, which is the
 * standard git/object-store shape and needs no rebalancing as the store grows.
 *
 * The stored file carries `.bin`, deliberately, exactly as the desktop locker
 * does: the real type is recorded in the `launch_assets` row after magic-byte
 * validation, and naming the file `.png` would invite some later reader to
 * trust the extension over the validation that actually happened.
 */
export function shardedRelativePath(cid: string): string {
  if (!CID_PATTERN.test(cid)) throw new AssetPathError();
  return `${cid.slice(0, 2)}/${cid.slice(2, 4)}/${cid}.bin`;
}

/** Thrown when a cid could name something outside the store. */
export class AssetPathError extends Error {
  override readonly name = "AssetPathError";
  constructor() {
    super("Refusing to resolve an asset path from a value that is not a content id.");
  }
}
