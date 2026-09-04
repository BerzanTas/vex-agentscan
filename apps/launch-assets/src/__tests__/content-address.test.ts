/**
 * CONTENT ADDRESSING - the arithmetic the on-chain promise rests on.
 *
 * If any of these change, a URL a user already approved starts resolving
 * somewhere else, so the cid vector is pinned against an independent
 * implementation and the canonical spelling of every extension is enumerated.
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AssetPathError,
  CID_PATTERN,
  contentIdOf,
  extensionFor,
  parseAssetName,
  publicUrlFor,
  shardedRelativePath,
} from "../content-address.js";
import { ASSET_CONTENT_TYPES } from "../image-bytes.js";

const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const CID = "abcd" + "0".repeat(60);

describe("contentIdOf", () => {
  it("is the lowercase hex sha256 of the exact bytes", () => {
    expect(contentIdOf(new Uint8Array(0))).toBe(EMPTY_SHA256);
    expect(CID_PATTERN.test(contentIdOf(new Uint8Array([1, 2, 3])))).toBe(true);
  });

  it("changes with a single flipped byte, which is what binds an approval to a picture", () => {
    const original = new Uint8Array([1, 2, 3, 4]);
    const tampered = new Uint8Array([1, 2, 3, 5]);
    expect(contentIdOf(original)).not.toBe(contentIdOf(tampered));
  });

  it("agrees with an independently computed digest", () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    expect(contentIdOf(bytes)).toBe(createHash("sha256").update(bytes).digest("hex"));
  });
});

describe("extensionFor", () => {
  it.each([
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["image/webp", "webp"],
    ["image/gif", "gif"],
  ] as const)("spells %s as .%s, and only that", (contentType, extension) => {
    expect(extensionFor(contentType)).toBe(extension);
  });

  it("covers every accepted content type, so no upload can be unaddressable", () => {
    for (const contentType of ASSET_CONTENT_TYPES) {
      expect(extensionFor(contentType)).toMatch(/^[a-z0-9]+$/);
    }
  });
});

describe("publicUrlFor", () => {
  it("builds the URL the install stores and the token carries", () => {
    expect(publicUrlFor("https://assets.example.com", CID, "image/jpeg")).toBe(
      `https://assets.example.com/a/${CID}.jpg`,
    );
  });
});

describe("shardedRelativePath", () => {
  it("shards two levels from the first four hex characters and stores a neutral .bin", () => {
    // `.bin`, not `.jpg`: the real type is the row's, recorded after magic-byte
    // validation, and a typed name on disk would invite a later reader to
    // trust the extension over the validation that actually happened.
    expect(shardedRelativePath(CID)).toBe(`ab/cd/${CID}.bin`);
  });

  it.each([
    ["../../../etc/passwd", "posix traversal"],
    ["..\\..\\evil", "windows traversal"],
    ["/etc/passwd", "an absolute path"],
    [`${CID}/../../evil`, "traversal appended to a valid cid"],
    [CID.toUpperCase(), "uppercase hex"],
    ["abc", "a short id"],
    ["", "an empty id"],
  ])("refuses %s (%s)", (cid) => {
    expect(() => shardedRelativePath(cid)).toThrow(AssetPathError);
  });
});

describe("parseAssetName", () => {
  it("splits a canonical name", () => {
    expect(parseAssetName(`${CID}.png`)).toEqual({ cid: CID, extension: "png" });
  });

  it.each([
    [CID, "a bare cid with no extension"],
    [`${CID}.png.html`, "a second extension smuggled on the end"],
    ["../secret.png", "a traversal"],
    [`${CID.slice(0, 63)}.png`, "a cid one character short"],
    [`${CID}.`, "an empty extension"],
    [`${CID}.PNG`, "an uppercase extension"],
  ])("refuses %s (%s)", (fileName) => {
    expect(parseAssetName(fileName)).toBeNull();
  });
});
