import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usdContributionOf, type UsdContribution } from "@agentscan/core";
import { agentPageActivities } from "../../repos/agent-page-repo.js";
import { pricingCoverage } from "../../repos/read-repo.js";
import { startTestDb } from "../../testing/pg-harness.js";

const AGENT = "a".repeat(64);
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

type TaxonomyCase = {
  label: string;
  eventRole: string;
  pricingState: string;
  usdInPriced: string | null;
  tokenOutAddress: string | null;
  usdOutPriced: string | null;
  contribution: UsdContribution;
};

const taxonomyCases: TaxonomyCase[] = [
  {
    label: "a priced swap with both legs valued",
    eventRole: "swap",
    pricingState: "server_priced",
    usdInPriced: "100",
    tokenOutAddress: WETH,
    usdOutPriced: "90",
    contribution: "contributes_usd",
  },
  {
    label: "a priced swap that declares no received token",
    eventRole: "swap",
    pricingState: "server_priced",
    usdInPriced: "100",
    tokenOutAddress: null,
    usdOutPriced: null,
    contribution: "contributes_usd",
  },
  {
    label: "a priced swap whose declared received token has no value",
    eventRole: "swap",
    pricingState: "server_priced",
    usdInPriced: "100",
    tokenOutAddress: WETH,
    usdOutPriced: null,
    contribution: "contributes_no_usd",
  },
  {
    label: "a priced swap whose spent leg has no value",
    eventRole: "swap",
    pricingState: "server_priced",
    usdInPriced: null,
    tokenOutAddress: WETH,
    usdOutPriced: "90",
    contribution: "contributes_no_usd",
  },
  {
    label: "a swap the lane gave up on",
    eventRole: "swap",
    pricingState: "unpriced",
    usdInPriced: null,
    tokenOutAddress: WETH,
    usdOutPriced: null,
    contribution: "contributes_no_usd",
  },
  {
    label: "a swap still awaiting a price",
    eventRole: "swap",
    pricingState: "pending",
    usdInPriced: null,
    tokenOutAddress: WETH,
    usdOutPriced: null,
    contribution: "awaiting_a_price",
  },
  {
    label: "a priced bridge deposit with both legs valued",
    eventRole: "bridge_deposit",
    pricingState: "server_priced",
    usdInPriced: "100",
    tokenOutAddress: WETH,
    usdOutPriced: "90",
    contribution: "contributes_usd",
  },
  {
    label: "a priced bridge fill, which carries no USD figure on either surface",
    eventRole: "bridge_fill_observed",
    pricingState: "server_priced",
    usdInPriced: "100",
    tokenOutAddress: WETH,
    usdOutPriced: "90",
    contribution: "outside_usd_figures",
  },
  {
    label: "a pending bridge fill, where the role decides before the pricing state",
    eventRole: "bridge_fill_observed",
    pricingState: "pending",
    usdInPriced: null,
    tokenOutAddress: WETH,
    usdOutPriced: null,
    contribution: "outside_usd_figures",
  },
];

let db: Awaited<ReturnType<typeof startTestDb>>;

async function seedOnly(pool: pg.Pool, seed: TaxonomyCase): Promise<void> {
  await pool.query("TRUNCATE agents CASCADE");
  await pool.query(
    `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, status)
     VALUES ($1, 'tok', 1, now(), 'active')`,
    [AGENT],
  );
  await pool.query(
    `INSERT INTO activities
       (agent_hash, source_row_id, public_id, source_execution_id, event_index, kind, event_role, status,
        protocol, chain_family, chain_id,
        token_in_address, token_in_decimals, executed_in_raw,
        token_out_address, token_out_decimals, executed_out_raw,
        usd_in_priced, usd_out_priced, pricing_state,
        client_created_at, client_confirmed_at, statuses_seen, verification_state,
        received_schema_version)
     VALUES ($1, 'taxonomy-row', 'taxonomy-row', 'taxonomy-row', 0, 'swap', $2, 'confirmed',
             'kyberswap', 'eip155', 8453,
             $3, 6, '1000000000',
             $4, CASE WHEN $4::text IS NULL THEN NULL ELSE 18 END,
             CASE WHEN $4::text IS NULL THEN NULL ELSE '1000000000000000000' END,
             $5::numeric, $6::numeric, $7,
             now() - interval '2 hours', now() - interval '1 hour',
             ARRAY['confirmed'], 'verified_full', 1)`,
    [AGENT, seed.eventRole, USDC, seed.tokenOutAddress, seed.usdInPriced, seed.usdOutPriced, seed.pricingState],
  );
}

async function sqlContributionOf(pool: pg.Pool): Promise<UsdContribution> {
  const coverage = await pricingCoverage(pool, null);
  const counters: [number, UsdContribution][] = [
    [coverage.pricedActivityCount, "contributes_usd"],
    [coverage.unpricedActivityCount, "contributes_no_usd"],
    [coverage.pendingActivityCount, "awaiting_a_price"],
  ];
  const claimed = counters.filter(([count]) => count > 0);
  expect(claimed.length).toBeLessThanOrEqual(1);
  return claimed[0]?.[1] ?? "outside_usd_figures";
}

async function coreContributionOf(pool: pg.Pool): Promise<UsdContribution> {
  const window = await agentPageActivities(pool, AGENT, 10);
  const activity = window.activities[0];
  if (activity === undefined) throw new Error("the seeded activity did not reach the agent page read");
  return usdContributionOf(activity);
}

beforeAll(async () => {
  db = await startTestDb();
});

afterAll(async () => {
  await db.stop();
});

describe("the priced/unpriced taxonomy is the same rule in SQL and in core", () => {
  it.each(taxonomyCases)("classifies $label the same way on both surfaces", async (seed) => {
    await seedOnly(db.pool, seed);

    expect(await sqlContributionOf(db.pool)).toBe(seed.contribution);
    expect(await coreContributionOf(db.pool)).toBe(seed.contribution);
  });
});
