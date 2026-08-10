import { sha256Hex } from "./auth.js";

export type RateLimitScope =
  | "ingest"
  | "register"
  | "attest"
  | "attest_submitter"
  | "handshake_start"
  | "handshake_complete";

export function rateLimitKeyHash(scope: RateLimitScope, value: string, salt: string): string {
  return sha256Hex(`${scope}:${salt}:${value}`);
}
