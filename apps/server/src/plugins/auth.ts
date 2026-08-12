import { createHash } from "node:crypto";
import type pg from "pg";
import type { AgentStatus } from "@agentscan/contract";

export type { AgentStatus } from "@agentscan/contract";

export type AuthenticatedAgent = { agentHash: string; status: AgentStatus; strikeCount: number };

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function bearerTokenFrom(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader?.startsWith("Bearer ")) return null;
  const bearerToken = authorizationHeader.slice("Bearer ".length).trim();
  return bearerToken.length > 0 ? bearerToken : null;
}

export async function authenticateAgent(
  pool: pg.Pool,
  bearerToken: string,
): Promise<AuthenticatedAgent | null> {
  const result = await pool.query<{ agent_hash: string; status: AgentStatus; strike_count: number }>(
    "SELECT agent_hash, status, strike_count FROM agents WHERE ingest_token_sha256 = $1",
    [sha256Hex(bearerToken)],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { agentHash: row.agent_hash, status: row.status, strikeCount: row.strike_count };
}
