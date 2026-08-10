import { describe, expect, it } from "vitest";
import { randomBase64UrlToken } from "../tokens.js";

describe("randomBase64UrlToken", () => {
  it("returns a 43-character base64url string for 32 bytes", () => {
    const token = randomBase64UrlToken(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("returns a different value on every call", () => {
    expect(randomBase64UrlToken(32)).not.toBe(randomBase64UrlToken(32));
  });
});
