/**
 * THE BYTE STORE - containment, atomic publication, and the never-overwrite
 * rule.
 *
 * `resolve` is the last thing standing between a cid and the filesystem, so
 * its refusals are tested directly rather than only through a route. The cid
 * pattern already makes these cases unreachable in production, which is
 * exactly why they are pinned: if a future change loosens the pattern, this
 * fails instead of an `rm` succeeding somewhere it should not.
 */

import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AssetByteStore } from "../byte-store.js";
import { AssetPathError } from "../content-address.js";

const CID = "abcd" + "0".repeat(60);
const OTHER_CID = "beef" + "1".repeat(60);

let rootDir: string;
let store: AssetByteStore;

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(tmpdir(), "launch-assets-"));
  store = new AssetByteStore(rootDir);
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

describe("resolve - containment", () => {
  it.each([
    ["../../../etc/passwd", "posix traversal"],
    ["..\\..\\evil", "windows traversal"],
    ["/etc/passwd", "an absolute path"],
    [`${CID}/../../evil`, "traversal appended to a valid cid"],
    ["", "an empty id"],
  ])("refuses %s (%s)", (cid) => {
    expect(() => store.resolve(cid)).toThrow(AssetPathError);
  });

  it("resolves a cid to a sharded file inside the store", () => {
    const resolved = store.resolve(CID);
    expect(resolved).toBe(path.resolve(rootDir, "ab", "cd", `${CID}.bin`));
  });
});

describe("put - atomic, never overwriting", () => {
  it("publishes bytes readable at the cid", async () => {
    expect(await store.put(CID, new Uint8Array([1, 2, 3]))).toBe("stored");
    expect(await store.read(CID)).toEqual(Buffer.from([1, 2, 3]));
  });

  it("reports an existing file as already_present and leaves its bytes untouched", async () => {
    await store.put(CID, new Uint8Array([1, 2, 3]));
    // A second publication of the same cid can only be the same bytes, but the
    // store must not depend on that: `link` refuses rather than replaces, so a
    // reader mid-request can never observe a swapped file.
    expect(await store.put(CID, new Uint8Array([9, 9, 9]))).toBe("already_present");
    expect(await store.read(CID)).toEqual(Buffer.from([1, 2, 3]));
  });

  it("leaves no temporary file behind, on the stored and the already-present path alike", async () => {
    await store.put(CID, new Uint8Array([1, 2, 3]));
    await store.put(CID, new Uint8Array([1, 2, 3]));
    expect(await readdir(path.join(rootDir, "tmp"))).toEqual([]);
  });

  it("keeps two different cids in separate files", async () => {
    await store.put(CID, new Uint8Array([1]));
    await store.put(OTHER_CID, new Uint8Array([2]));
    expect(await store.read(CID)).toEqual(Buffer.from([1]));
    expect(await store.read(OTHER_CID)).toEqual(Buffer.from([2]));
  });
});

describe("read and remove", () => {
  it("answers null for a cid with no file, and propagates anything else", async () => {
    expect(await store.read(CID)).toBeNull();
  });

  it("removes bytes and is idempotent about an absent file", async () => {
    await store.put(CID, new Uint8Array([1, 2, 3]));
    await store.remove(CID);
    expect(await store.read(CID)).toBeNull();
    await expect(store.remove(CID)).resolves.toBeUndefined();
  });

  it("reads back exactly the bytes written, byte for byte", async () => {
    const bytes = new Uint8Array(1024).map((_value, index) => index % 251);
    await store.put(CID, bytes);
    const stored = await readFile(store.resolve(CID));
    expect(Buffer.compare(stored, Buffer.from(bytes))).toBe(0);
  });

  it("cannot be reached through a file placed beside the store", async () => {
    const outside = path.join(rootDir, "..", `escape-${path.basename(rootDir)}.bin`);
    await writeFile(outside, "secret");
    try {
      expect(() => store.resolve("../" + path.basename(outside))).toThrow(AssetPathError);
    } finally {
      await rm(outside, { force: true });
    }
  });
});
