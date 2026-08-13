import { fastify, type FastifyInstance } from "fastify";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveBridgeChain, resolveChain } from "@agentscan/core";
import { loadConfig } from "../../config.js";
import type { PricingCoverageDto } from "../../public-dto.js";
import { pricingCoverageRoutes } from "../../routes/public/pricing-coverage.js";
import { startTestDb } from "../../testing/pg-harness.js";

const agentHash = "9".repeat(64);

type ActivitySeed = {
  sourceRowId: string;
  pricingState: "server_priced" | "unpriced" | "pending";
  verificationState: string;
  confirmedHoursAgo: number;
  kind?: "swap" | "bridge" | "launch";
  eventRole?: "swap" | "bridge_deposit" | "bridge_fill_observed" | "token_launch";
  usdInPriced?: string | null;
  usdOutPriced?: string | null;
  tokenOutAddress?: string | null;
};

function defaultUsdInPriced(seed: ActivitySeed): string | null {
  if (seed.usdInPriced !== undefined) return seed.usdInPriced;
  return seed.pricingState === "server_priced" ? "1.00" : null;
}

async function seedActivity(pool: pg.Pool, seed: ActivitySeed): Promise<void> {
  await pool.query(
    `INSERT INTO activities
       (agent_hash, source_row_id, public_id, source_execution_id, event_index, kind, event_role, status,
        protocol, chain_family, chain_id, usd_in_priced, usd_out_priced, token_out_address,
        pricing_state, tx_hash,
        client_created_at, client_confirmed_at, statuses_seen, verification_state, verified_at,
        received_at, received_schema_version)
     VALUES ($1, $2, $2, $2, 0, $6, $7, 'confirmed',
             'kyberswap', 'eip155', 8453, $8::numeric, $9::numeric, $10,
             $3, '0x' || $2,
             now() - make_interval(hours => $4::int), now() - make_interval(hours => $4::int),
             ARRAY['confirmed'], $5, now(), now(), 1)`,
    [
      agentHash,
      seed.sourceRowId,
      seed.pricingState,
      seed.confirmedHoursAgo,
      seed.verificationState,
      seed.kind ?? "swap",
      seed.eventRole ?? "swap",
      defaultUsdInPriced(seed),
      seed.usdOutPriced ?? null,
      seed.tokenOutAddress ?? null,
    ],
  );
}

const INSIDE_THE_DAY = 1;
const OUTSIDE_THE_DAY = 48;

let db: Awaited<ReturnType<typeof startTestDb>>;
let app: FastifyInstance;

async function coverageFor(range: string): Promise<PricingCoverageDto> {
  const response = await app.inject({ method: "GET", url: `/api/pricing-coverage?range=${range}` });
  expect(response.statusCode).toBe(200);
  return response.json<PricingCoverageDto>();
}

async function resetActivities(): Promise<void> {
  await db.pool.query("DELETE FROM activities");
}

beforeAll(async () => {
  db = await startTestDb();
  await db.pool.query(
    `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, first_verified_at)
     VALUES ($1, 'token-sha', 1, now(), now())`,
    [agentHash],
  );
  app = fastify();
  await app.register(pricingCoverageRoutes, {
    pool: db.pool,
    config: loadConfig({ DATABASE_URL: "postgres://unused-in-tests", READ_CACHE_TTL_SEC: "0" }),
    resolveChain,
    resolveBridgeChain,
  });
}, 120_000);

afterAll(async () => {
  await app.close();
  await db.stop();
});

describe("GET /api/pricing-coverage", () => {
  it("reports zero counts and zero coverage on an empty window", async () => {
    await resetActivities();

    expect(await coverageFor("24h")).toEqual({
      pricedActivityCount: 0,
      unpricedActivityCount: 0,
      pendingActivityCount: 0,
      pricedCoverage: 0,
    });
  });

  it("splits the window across the three pricing states", async () => {
    await resetActivities();
    await seedActivity(db.pool, { sourceRowId: "cov-priced-1", pricingState: "server_priced", verificationState: "verified_full", confirmedHoursAgo: INSIDE_THE_DAY });
    await seedActivity(db.pool, { sourceRowId: "cov-priced-2", pricingState: "server_priced", verificationState: "verified_basic", confirmedHoursAgo: INSIDE_THE_DAY });
    await seedActivity(db.pool, { sourceRowId: "cov-priced-3", pricingState: "server_priced", verificationState: "verified_full", confirmedHoursAgo: INSIDE_THE_DAY });
    await seedActivity(db.pool, { sourceRowId: "cov-unpriced-1", pricingState: "unpriced", verificationState: "verified_full", confirmedHoursAgo: INSIDE_THE_DAY });
    await seedActivity(db.pool, { sourceRowId: "cov-pending-1", pricingState: "pending", verificationState: "verified_full", confirmedHoursAgo: INSIDE_THE_DAY });

    expect(await coverageFor("24h")).toEqual({
      pricedActivityCount: 3,
      unpricedActivityCount: 1,
      pendingActivityCount: 1,
      pricedCoverage: 0.75,
    });
  });

  it("counts a partially priced row as unpriced on whichever leg the figure is missing", async () => {
    await resetActivities();
    await seedActivity(db.pool, {
      sourceRowId: "cov-partial-sell",
      pricingState: "server_priced",
      verificationState: "verified_full",
      confirmedHoursAgo: INSIDE_THE_DAY,
      usdInPriced: null,
      usdOutPriced: "2495",
      tokenOutAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    });
    await seedActivity(db.pool, {
      sourceRowId: "cov-partial-buy",
      pricingState: "server_priced",
      verificationState: "verified_full",
      confirmedHoursAgo: INSIDE_THE_DAY,
      usdInPriced: "2500",
      usdOutPriced: null,
      tokenOutAddress: `0x${"5".repeat(40)}`,
    });

    expect(await coverageFor("24h")).toEqual({
      pricedActivityCount: 0,
      unpricedActivityCount: 2,
      pendingActivityCount: 0,
      pricedCoverage: 0,
    });
  });

  it("keeps a pending row out of both sides of the ratio", async () => {
    await resetActivities();
    await seedActivity(db.pool, { sourceRowId: "cov-only-pending", pricingState: "pending", verificationState: "verified_full", confirmedHoursAgo: INSIDE_THE_DAY });

    expect(await coverageFor("24h")).toEqual({
      pricedActivityCount: 0,
      unpricedActivityCount: 0,
      pendingActivityCount: 1,
      pricedCoverage: 0,
    });
  });

  it("counts only the rows confirmed inside the requested window", async () => {
    await resetActivities();
    await seedActivity(db.pool, { sourceRowId: "cov-recent", pricingState: "server_priced", verificationState: "verified_full", confirmedHoursAgo: INSIDE_THE_DAY });
    await seedActivity(db.pool, { sourceRowId: "cov-old", pricingState: "unpriced", verificationState: "verified_full", confirmedHoursAgo: OUTSIDE_THE_DAY });

    expect(await coverageFor("24h")).toEqual({
      pricedActivityCount: 1,
      unpricedActivityCount: 0,
      pendingActivityCount: 0,
      pricedCoverage: 1,
    });
    expect(await coverageFor("all")).toEqual({
      pricedActivityCount: 1,
      unpricedActivityCount: 1,
      pendingActivityCount: 0,
      pricedCoverage: 0.5,
    });
  });

  it("leaves unverified rows out of the coverage entirely", async () => {
    await resetActivities();
    await seedActivity(db.pool, { sourceRowId: "cov-verified", pricingState: "server_priced", verificationState: "verified_full", confirmedHoursAgo: INSIDE_THE_DAY });
    await seedActivity(db.pool, { sourceRowId: "cov-unverified", pricingState: "pending", verificationState: "none", confirmedHoursAgo: INSIDE_THE_DAY });
    await seedActivity(db.pool, { sourceRowId: "cov-mismatch", pricingState: "pending", verificationState: "mismatch", confirmedHoursAgo: INSIDE_THE_DAY });

    expect(await coverageFor("24h")).toEqual({
      pricedActivityCount: 1,
      unpricedActivityCount: 0,
      pendingActivityCount: 0,
      pricedCoverage: 1,
    });
  });

  it("measures only the legs the usd figures sum, not every verified row", async () => {
    await resetActivities();
    await seedActivity(db.pool, { sourceRowId: "cov-volume-leg", pricingState: "server_priced", verificationState: "verified_full", confirmedHoursAgo: INSIDE_THE_DAY });
    await seedActivity(db.pool, { sourceRowId: "cov-fill-leg", pricingState: "unpriced", verificationState: "verified_full", confirmedHoursAgo: INSIDE_THE_DAY, kind: "bridge", eventRole: "bridge_fill_observed" });
    await seedActivity(db.pool, { sourceRowId: "cov-launch", pricingState: "unpriced", verificationState: "verified_full", confirmedHoursAgo: INSIDE_THE_DAY, kind: "launch", eventRole: "token_launch" });

    expect(await coverageFor("24h")).toEqual({
      pricedActivityCount: 1,
      unpricedActivityCount: 0,
      pendingActivityCount: 0,
      pricedCoverage: 1,
    });
  });

  it("degrades an unknown range to thirty days", async () => {
    await resetActivities();
    await seedActivity(db.pool, { sourceRowId: "cov-in-30d", pricingState: "server_priced", verificationState: "verified_full", confirmedHoursAgo: 24 * 10 });
    await seedActivity(db.pool, { sourceRowId: "cov-past-30d", pricingState: "server_priced", verificationState: "verified_full", confirmedHoursAgo: 24 * 40 });

    expect(await coverageFor("nonsense")).toEqual(await coverageFor("30d"));
    expect((await coverageFor("30d")).pricedActivityCount).toBe(1);
  });

  it("labels the response cacheable for the read cache window", async () => {
    const response = await app.inject({ method: "GET", url: "/api/pricing-coverage?range=24h" });

    expect(response.headers["cache-control"]).toBe("public, s-maxage=0");
  });
});
