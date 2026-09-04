import type pg from "pg";
import { logicalRowIn, type AgentActivity, type ChainFamily, type PricingState } from "@agentscan/core";
import { activityTimeAnchorSql } from "./activity-time-anchor.js";

const VERIFIED_STATES = "('verified_full','verified_basic')";
const OBSERVED_AT = activityTimeAnchorSql("a");

const PRICING_STATES: readonly PricingState[] = ["pending", "server_priced", "unpriced"];

/** The Vex fee leg belongs to the action it charges for, so it is no row of this agent's history. */
const LOGICAL_ROW_PREDICATE = logicalRowIn("a.event_role");

type AgentActivityQueryRow = {
  id: string;
  kind: string;
  event_role: string;
  protocol: string;
  chain_family: string;
  chain_id: string;
  pricing_state: string;
  usd_in_priced: string | null;
  usd_out_priced: string | null;
  token_in_address: string | null;
  token_in_decimals: number | null;
  executed_in_raw: string | null;
  token_out_address: string | null;
  token_out_decimals: number | null;
  executed_out_raw: string | null;
  observed_at_seconds: string;
};

function chainFamilyOf(raw: string): ChainFamily {
  return raw === "solana" ? "solana" : "eip155";
}

function pricingStateOf(raw: string): PricingState {
  const state = PRICING_STATES.find((candidate) => candidate === raw);
  if (state === undefined) throw new Error(`unknown pricing state: ${raw}`);
  return state;
}

function agentActivityFrom(row: AgentActivityQueryRow): AgentActivity {
  return {
    activityId: BigInt(row.id),
    observedAtSeconds: Number(row.observed_at_seconds),
    kind: row.kind,
    eventRole: row.event_role,
    protocol: row.protocol,
    chainFamily: chainFamilyOf(row.chain_family),
    chainId: BigInt(row.chain_id),
    pricingState: pricingStateOf(row.pricing_state),
    spent: {
      tokenAddress: row.token_in_address,
      tokenDecimals: row.token_in_decimals,
      executedRaw: row.executed_in_raw,
      usdPriced: row.usd_in_priced,
    },
    received: {
      tokenAddress: row.token_out_address,
      tokenDecimals: row.token_out_decimals,
      executedRaw: row.executed_out_raw,
      usdPriced: row.usd_out_priced,
    },
  };
}

export type PublishedAgent = { agentHash: string; firstObservedAtSeconds: number };

export async function publishedAgent(pool: pg.Pool, name: string): Promise<PublishedAgent | null> {
  const result = await pool.query<{ agent_hash: string; first_observed_at_seconds: string }>(
    `SELECT ag.agent_hash,
            floor(extract(epoch FROM MIN(${OBSERVED_AT})))::bigint::text AS first_observed_at_seconds
     FROM agents ag
     JOIN activities a ON a.agent_hash = ag.agent_hash
                      AND a.verification_state IN ${VERIFIED_STATES}
     WHERE ag.name = $1 AND ag.status = 'active'
     GROUP BY ag.agent_hash`,
    [name],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  return {
    agentHash: row.agent_hash,
    firstObservedAtSeconds: Number(row.first_observed_at_seconds),
  };
}

export async function publishedAgentNames(
  pool: pg.Pool,
  agentHashes: readonly string[],
): Promise<Map<string, string>> {
  if (agentHashes.length === 0) return new Map();
  const result = await pool.query<{ agent_hash: string; name: string }>(
    `SELECT ag.agent_hash, ag.name
     FROM agents ag
     WHERE ag.agent_hash = ANY($1::text[]) AND ag.status = 'active' AND ag.name IS NOT NULL`,
    [agentHashes],
  );
  return new Map(result.rows.map((row) => [row.agent_hash, row.name]));
}

export type AgentActivityWindow = { activities: AgentActivity[]; truncated: boolean };

export async function agentPageActivities(
  pool: pg.Pool,
  agentHash: string,
  rowsMax: number,
): Promise<AgentActivityWindow> {
  const result = await pool.query<AgentActivityQueryRow>(
    `SELECT a.id::text AS id,
            a.kind, a.event_role, a.protocol, a.chain_family, a.chain_id::text AS chain_id,
            a.pricing_state,
            a.usd_in_priced::text AS usd_in_priced,
            a.usd_out_priced::text AS usd_out_priced,
            a.token_in_address, a.token_in_decimals, a.executed_in_raw,
            a.token_out_address, a.token_out_decimals, a.executed_out_raw,
            floor(extract(epoch FROM ${OBSERVED_AT}))::bigint::text AS observed_at_seconds
     FROM activities a
     WHERE a.agent_hash = $1
       AND a.verification_state IN ${VERIFIED_STATES}
       AND ${LOGICAL_ROW_PREDICATE}
     ORDER BY ${OBSERVED_AT} DESC, a.id DESC
     LIMIT $2`,
    [agentHash, rowsMax],
  );
  return {
    activities: result.rows.map(agentActivityFrom),
    truncated: result.rows.length === rowsMax,
  };
}
