import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type ResolveChain } from "../../app.js";
import { loadConfig } from "../../config.js";
import type { ActivityFeedDto, ChartPointDto, ProtocolStatDto, StatsDto, TxDetailDto } from "../../public-dto.js";
import { startTestDb } from "../../testing/pg-harness.js";

const agentA = "a".repeat(64);
const agentB = "b".repeat(64);
const agentC = "c".repeat(64);

const stubResolveChain: ResolveChain = ({ chainFamily, chainId }) =>
  chainFamily === "eip155" && chainId === 8453n
    ? {
        canonicalSlug: "base",
        displayName: "Base",
        explorerTxUrl: (txHash) => `https://basescan.org/tx/${txHash}`,
        rpcUrls: [],
        verificationTier: "full",
      }
    : null;

async function seedAgent(pool: pg.Pool, agentHash: string, verifiedBefore: boolean): Promise<void> {
  await pool.query(
    `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, first_verified_at)
     VALUES ($1, 'token-sha', 1, now(), CASE WHEN $2::bool THEN now() ELSE NULL END)`,
    [agentHash, verifiedBefore],
  );
}

type ActivitySeed = {
  agentHash: string;
  publicId: string;
  status: "pending" | "confirmed";
  verificationState: string;
  receivedSecondsAgo: number;
  txHash: string | null;
  usdInEst: string | null;
};

async function seedActivity(pool: pg.Pool, seed: ActivitySeed): Promise<void> {
  await pool.query(
    `INSERT INTO activities
       (agent_hash, source_row_id, public_id, source_execution_id, event_index, kind, event_role, status,
        protocol, chain_family, chain_id, token_in_symbol, token_in_decimals, token_out_symbol,
        amount_in_raw, usd_in_est, tx_hash, client_created_at, client_confirmed_at, statuses_seen,
        verification_state, received_at, received_schema_version)
     VALUES ($1, $2, $2, 'exec-1', 0, 'swap', 'swap', $3,
             'kyberswap', 'eip155', 8453, 'ETH', 18, 'VEX',
             '1000000000000000000', $4, $5, now() - interval '2 hours',
             CASE WHEN $3 = 'confirmed' THEN now() - interval '1 hour' ELSE NULL END,
             ARRAY['pending'], $6, now() - make_interval(secs => $7), 1)`,
    [seed.agentHash, seed.publicId, seed.status, seed.usdInEst, seed.txHash, seed.verificationState, seed.receivedSecondsAgo],
  );
}

let db: Awaited<ReturnType<typeof startTestDb>>;
let app: FastifyInstance;
let seededDays: string[];

beforeAll(async () => {
  db = await startTestDb();
  await seedAgent(db.pool, agentA, true);
  await seedAgent(db.pool, agentB, false);
  await seedAgent(db.pool, agentC, false);
  await seedActivity(db.pool, { agentHash: agentA, publicId: "pub-verified-1", status: "confirmed", verificationState: "verified_full", receivedSecondsAgo: 300, txHash: "0xv1", usdInEst: "100.25" });
  await seedActivity(db.pool, { agentHash: agentA, publicId: "pub-verified-2", status: "confirmed", verificationState: "verified_full", receivedSecondsAgo: 240, txHash: "0xv2", usdInEst: "40" });
  await seedActivity(db.pool, { agentHash: agentA, publicId: "pub-verified-3", status: "confirmed", verificationState: "verified_basic", receivedSecondsAgo: 180, txHash: "0xv3", usdInEst: "10" });
  await seedActivity(db.pool, { agentHash: agentA, publicId: "pub-pending-a", status: "pending", verificationState: "none", receivedSecondsAgo: 120, txHash: null, usdInEst: null });
  await seedActivity(db.pool, { agentHash: agentB, publicId: "pub-pending-b", status: "pending", verificationState: "none", receivedSecondsAgo: 90, txHash: null, usdInEst: null });
  await seedActivity(db.pool, { agentHash: agentA, publicId: "pub-mismatch-a", status: "confirmed", verificationState: "mismatch", receivedSecondsAgo: 60, txHash: "0xbad", usdInEst: "999" });
  await seedActivity(db.pool, { agentHash: agentC, publicId: "pub-mismatch-c", status: "confirmed", verificationState: "mismatch", receivedSecondsAgo: 30, txHash: "0xbadc", usdInEst: "888" });
  await db.pool.query(
    `INSERT INTO daily_aggregates (day, protocol, kind, volume_usd, tx_count) VALUES
       ((now() AT TIME ZONE 'utc')::date, 'kyberswap', 'swap', 100.5, 2),
       ((now() AT TIME ZONE 'utc')::date - 1, 'relay', 'bridge', 50.25, 1)`,
  );
  const dayRows = await db.pool.query<{ day: string }>("SELECT day::text AS day FROM daily_aggregates ORDER BY day");
  seededDays = dayRows.rows.map((row) => row.day);
  const config = loadConfig({ DATABASE_URL: "postgres://unused-in-tests", PUBLIC_FEED_PAGE_SIZE: "2" });
  app = await buildApp({ pool: db.pool, config, resolveChain: stubResolveChain });
});

afterAll(async () => {
  await app.close();
  await db.stop();
});

describe("GET /api/activity", () => {
  it("shows pending rows only for agents with a verified activity and never mismatch rows", async () => {
    const response = await app.inject({ method: "GET", url: "/api/activity" });
    expect(response.statusCode).toBe(200);
    const feed = response.json<ActivityFeedDto>();
    expect(feed.items.map((item) => item.publicId)).toEqual(["pub-pending-a", "pub-verified-3"]);
    expect(feed.nextCursor).not.toBeNull();
  });

  it("pages by cursor without duplicates and ends with a null cursor", async () => {
    const firstResponse = await app.inject({ method: "GET", url: "/api/activity" });
    const firstPage = firstResponse.json<ActivityFeedDto>();
    const secondResponse = await app.inject({ method: "GET", url: `/api/activity?cursor=${firstPage.nextCursor}` });
    expect(secondResponse.statusCode).toBe(200);
    const secondPage = secondResponse.json<ActivityFeedDto>();
    expect(firstPage.items.map((item) => item.publicId)).toEqual(["pub-pending-a", "pub-verified-3"]);
    expect(secondPage.items.map((item) => item.publicId)).toEqual(["pub-verified-2", "pub-verified-1"]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("rejects a malformed cursor with invalid_cursor", async () => {
    const response = await app.inject({ method: "GET", url: "/api/activity?cursor=not-a-cursor" });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("invalid_cursor");
  });
});

describe("GET /api/tx/:publicId", () => {
  it("serves detail with chain presentation for a verified row", async () => {
    const response = await app.inject({ method: "GET", url: "/api/tx/pub-verified-1" });
    expect(response.statusCode).toBe(200);
    const detail = response.json<TxDetailDto>();
    expect(detail.publicId).toBe("pub-verified-1");
    expect(detail.verificationState).toBe("verified_full");
    expect(detail.chainSlug).toBe("base");
    expect(detail.explorerUrl).toBe("https://basescan.org/tx/0xv1");
    expect(detail.txHash).toBe("0xv1");
    expect(detail.usdInEst).toBe("100.25");
    expect(detail.amountInRaw).toBe("1000000000000000000");
    expect(detail.clientConfirmedAt).not.toBeNull();
  });

  it("serves a pending row of an agent with a verified activity", async () => {
    const response = await app.inject({ method: "GET", url: "/api/tx/pub-pending-a" });
    expect(response.statusCode).toBe(200);
    expect(response.json<TxDetailDto>().publicId).toBe("pub-pending-a");
  });

  it("hides a mismatch row even though its agent is verified", async () => {
    const response = await app.inject({ method: "GET", url: "/api/tx/pub-mismatch-a" });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("not_found");
  });

  it("hides pending rows of agents without a verified activity", async () => {
    const response = await app.inject({ method: "GET", url: "/api/tx/pub-pending-b" });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("not_found");
  });

  it("answers not_found for an unknown publicId", async () => {
    const response = await app.inject({ method: "GET", url: "/api/tx/does-not-exist" });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("not_found");
  });
});

describe("GET /api/stats", () => {
  it("reads totals from daily aggregates and counts only verified activity", async () => {
    const response = await app.inject({ method: "GET", url: "/api/stats" });
    expect(response.statusCode).toBe(200);
    expect(response.json<StatsDto>()).toEqual({
      dailyVolumeUsd: "100.5",
      totalVolumeUsd: "150.75",
      dailyTx: 2,
      totalTx: 3,
      activeAgents7d: 1,
    });
  });
});

describe("GET /api/chart", () => {
  it("returns seeded daily aggregates as chart points ordered by day", async () => {
    const response = await app.inject({ method: "GET", url: "/api/chart?days=30" });
    expect(response.statusCode).toBe(200);
    expect(response.json<ChartPointDto[]>()).toEqual([
      { day: seededDays[0], volumeUsd: "50.25", txCount: 1 },
      { day: seededDays[1], volumeUsd: "100.5", txCount: 2 },
    ]);
  });
});

describe("GET /api/protocols", () => {
  it("ranks protocols by aggregated volume", async () => {
    const response = await app.inject({ method: "GET", url: "/api/protocols" });
    expect(response.statusCode).toBe(200);
    expect(response.json<ProtocolStatDto[]>()).toEqual([
      { protocol: "kyberswap", volumeUsd: "100.5", txCount: 2 },
      { protocol: "relay", volumeUsd: "50.25", txCount: 1 },
    ]);
  });
});
