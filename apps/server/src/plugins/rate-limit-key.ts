import { sha256Hex } from "@agentscan/install-identity";

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
