/**
 * The credential parser is now a package contract - two services read it - so
 * the header shapes it must and must not accept are pinned here rather than
 * only inside whichever route happened to exercise them.
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bearerTokenFrom, sha256Hex } from "../install-identity.js";

describe("bearerTokenFrom", () => {
  it("reads the token out of a well-formed Authorization header", () => {
    expect(bearerTokenFrom("Bearer abc123")).toBe("abc123");
  });

  const malformed: readonly (readonly [string | undefined, string])[] = [
    [undefined, "an absent header"],
    ["", "an empty header"],
    ["abc123", "a bare token with no scheme"],
    ["bearer abc123", "a lowercase scheme"],
    ["Basic abc123", "a different scheme"],
    ["Bearer ", "a scheme with no token"],
    ["Bearer    ", "a scheme with only whitespace"],
  ];

  it.each(malformed)("returns null for %s (%s)", (header) => {
    expect(bearerTokenFrom(header)).toBeNull();
  });
});

describe("sha256Hex", () => {
  it("is the lowercase hex digest the agents table stores", () => {
    expect(sha256Hex("token")).toBe(createHash("sha256").update("token").digest("hex"));
  });
});
