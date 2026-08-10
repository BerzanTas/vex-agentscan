import { randomBytes } from "node:crypto";

export function randomBase64UrlToken(byteLength: number): string {
  return randomBytes(byteLength).toString("base64url");
}
