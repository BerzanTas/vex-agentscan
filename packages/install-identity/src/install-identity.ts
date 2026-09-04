/**
 * THE INSTALL CREDENTIAL - one owner for the only thing that says "this
 * request comes from a Vex install we have already met".
 *
 * The pair is minted by the handshake (`apps/server/src/routes/handshake.ts`):
 * an `agentHash` naming the install and an opaque ingest token whose sha256 is
 * the stored row. Every service that trusts an install verifies it HERE. It
 * lives in its own package rather than inside the AgentScan API because a
 * second service (the launch-assets host, `apps/launch-assets`) authenticates
 * the SAME installs, and a forked copy of this check is a defect waiting for
 * the two copies to drift.
 *
 * WHAT THIS DOES NOT DECIDE: the install's reporting `status` is reported,
 * never enforced. Reporting consent (`revoked`) and the ingest anti-abuse
 * signal (`quarantined`) are policies of the service that reads them - the
 * ingest route refuses on both, the asset host deliberately does not (see
 * `apps/launch-assets/src/routes/upload.ts`). Authentication says who; each
 * service owns its own authorization.
 */

import { createHash } from "node:crypto";
import type pg from "pg";
import type { AgentStatus } from "@agentscan/contract";

export type { AgentStatus } from "@agentscan/contract";

/** The install behind an authenticated request, with the reporting facts its caller may weigh. */
export type AuthenticatedInstall = {
  agentHash: string;
  status: AgentStatus;
  strikeCount: number;
};

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function bearerTokenFrom(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader?.startsWith("Bearer ")) return null;
  const bearerToken = authorizationHeader.slice("Bearer ".length).trim();
  return bearerToken.length > 0 ? bearerToken : null;
}

/**
 * `null` means the token matches no install. The lookup is by the token's
 * digest, so the table never holds the token itself.
 */
export async function authenticateInstall(
  pool: pg.Pool,
  bearerToken: string,
): Promise<AuthenticatedInstall | null> {
  const result = await pool.query<{ agent_hash: string; status: AgentStatus; strike_count: number }>(
    "SELECT agent_hash, status, strike_count FROM agents WHERE ingest_token_sha256 = $1",
    [sha256Hex(bearerToken)],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { agentHash: row.agent_hash, status: row.status, strikeCount: row.strike_count };
}
