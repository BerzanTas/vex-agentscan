/**
 * THE BYTE STORE - the only place in this service that touches asset bytes on
 * disk. The METADATA is not here: it lives in the `launch_assets` table, so
 * there is exactly one source of truth for what an asset IS and this module
 * only answers "give me / keep / drop the bytes for this cid".
 *
 * NO PATH PARAMETER EXISTS ANYWHERE PUBLIC. Every entry point takes a cid, and
 * a cid is 64 anchored hex characters with no `/`, `\` or `.`, so it cannot be
 * a relative path segment. `resolve` still re-derives the path and re-checks
 * containment before touching the disk: the cid pattern is the design,
 * containment is the proof, and a traversal test pins both. Adopted from
 * `vex-app/src/main/images/byte-store.ts`, whose two-gate resolution this is.
 *
 * PUBLICATION IS ATOMIC AND NEVER OVERWRITES. Bytes land in a temp file, are
 * flushed, and are then published with `link()`, which fails EEXIST rather
 * than replacing a file that is already there. `rename()` would have been the
 * obvious choice and is wrong here: it would silently overwrite, and for a
 * content-addressed store "already there" is the normal case, not an error.
 * Two concurrent uploads of identical bytes therefore both succeed and neither
 * can observe a half-written file.
 */

import { randomBytes } from "node:crypto";
import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { AssetPathError, CID_PATTERN, shardedRelativePath } from "./content-address.js";

const TEMP_DIR_NAME = "tmp";

/**
 * The store owns one directory tree. The temp directory lives INSIDE it on
 * purpose: `link()` cannot cross a filesystem, so a temp file elsewhere would
 * make atomic publication impossible.
 */
export class AssetByteStore {
  constructor(private readonly rootDir: string) {}

  /** Absolute path of the file holding this cid's bytes. Two gates, as above. */
  resolve(cid: string): string {
    if (!CID_PATTERN.test(cid)) throw new AssetPathError();
    const resolved = path.resolve(this.rootDir, shardedRelativePath(cid));
    const root = path.resolve(this.rootDir);
    if (!resolved.startsWith(`${root}${path.sep}`)) throw new AssetPathError();
    return resolved;
  }

  /**
   * Publish bytes for a cid. `"stored"` means this call created the file,
   * `"already_present"` means identical bytes were already published - both
   * are success, and the caller distinguishes them only for its log line.
   *
   * The caller has already hashed the bytes; this method does not re-derive
   * the cid, because the cid is the caller's authority for where the bytes go.
   */
  async put(cid: string, bytes: Uint8Array): Promise<"stored" | "already_present"> {
    const target = this.resolve(cid);
    await mkdir(path.dirname(target), { recursive: true });
    const tempPath = await this.writeTemp(bytes);
    try {
      await link(tempPath, target);
      return "stored";
    } catch (cause) {
      if (errorCode(cause) === "EEXIST") return "already_present";
      throw cause;
    } finally {
      await rm(tempPath, { force: true });
    }
  }

  /**
   * `null` means no such file - an expected answer the caller refuses on by
   * name. Any OTHER failure propagates, because "the store is broken" must
   * never be reported to a reader as "that asset does not exist".
   */
  async read(cid: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolve(cid));
    } catch (cause) {
      if (errorCode(cause) === "ENOENT") return null;
      throw cause;
    }
  }

  /** Remove the bytes. Idempotent: deleting an absent file is a success. */
  async remove(cid: string): Promise<void> {
    await rm(this.resolve(cid), { force: true });
  }

  private async writeTemp(bytes: Uint8Array): Promise<string> {
    const tempDir = path.join(this.rootDir, TEMP_DIR_NAME);
    await mkdir(tempDir, { recursive: true });
    const tempPath = path.join(tempDir, `${randomBytes(16).toString("hex")}.part`);
    // `flush` fsyncs before the handle closes, so the bytes are durable before
    // `link()` makes them reachable. Without it a crash between the two could
    // publish a name whose content is not yet on the platter.
    await writeFile(tempPath, bytes, { flush: true });
    return tempPath;
  }
}

function errorCode(cause: unknown): string | undefined {
  if (typeof cause !== "object" || cause === null) return undefined;
  const code = (cause as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
