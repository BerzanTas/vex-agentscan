import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type ResolveChain } from "../../app.js";
import { loadConfig } from "../../config.js";
import type { LookupDto } from "../../public-dto.js";
import { startTestDb } from "../../testing/pg-harness.js";

const agentVerified = "a".repeat(64);
const agentUnverified = "b".repeat(64);

const stubResolveChain: ResolveChain = () => null;

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
  txHash: string | null;
};

async function seedActivity(pool: pg.Pool, seed: ActivitySeed): Promise<void> {
  await pool.query(
    `INSERT INTO activities
       (agent_hash, source_row_id, public_id, source_execution_id, event_index, kind, event_role, status,
        protocol, chain_family, chain_id, token_in_symbol, token_in_decimals, token_out_symbol,
        amount_in_raw, tx_hash, client_created_at, client_confirmed_at, statuses_seen,
        verification_state, received_at, received_schema_version)
     VALUES ($1, $2, $2, 'exec-1', 0, 'swap', 'swap', $3,
             'kyberswap', 'eip155', 8453, 'ETH', 18, 'VEX',
             '1000000000000000000', $4, now() - interval '2 hours',
             CASE WHEN $3 = 'confirmed' THEN now() - interval '1 hour' ELSE NULL END,
             ARRAY['pending'], $5, now(), 1)`,
    [seed.agentHash, seed.publicId, seed.status, seed.txHash, seed.verificationState],
  );
}

let db: Awaited<ReturnType<typeof startTestDb>>;
let app: FastifyInstance;

beforeAll(async () => {
  db = await startTestDb();
  await seedAgent(db.pool, agentVerified, true);
  await seedAgent(db.pool, agentUnverified, false);
  await seedActivity(db.pool, {
    agentHash: agentVerified,
    publicId: "pub-look-1",
    status: "confirmed",
    verificationState: "verified_full",
    txHash: "0xAbCd1234Ef56",
  });
  await seedActivity(db.pool, {
    agentHash: agentVerified,
    publicId: "pub-look-mismatch",
    status: "confirmed",
    verificationState: "mismatch",
    txHash: "0xBadBadBad00",
  });
  await seedActivity(db.pool, {
    agentHash: agentUnverified,
    publicId: "pub-look-hidden-pending",
    status: "pending",
    verificationState: "none",
    txHash: "0xFeedFeed11",
  });
  const config = loadConfig({ DATABASE_URL: "postgres://unused-in-tests" });
  app = await buildApp({ pool: db.pool, config, resolveChain: stubResolveChain });
});

afterAll(async () => {
  await app.close();
  await db.stop();
});

describe("GET /api/lookup", () => {
  it("finds a visible activity by publicId and returns only the publicId", async () => {
    const response = await app.inject({ method: "GET", url: "/api/lookup?q=pub-look-1" });
    expect(response.statusCode).toBe(200);
    expect(response.json<LookupDto>()).toEqual({ publicId: "pub-look-1" });
  });

  it("finds a visible activity by exact txHash with the 0x prefix", async () => {
    const response = await app.inject({ method: "GET", url: "/api/lookup?q=0xAbCd1234Ef56" });
    expect(response.statusCode).toBe(200);
    expect(response.json<LookupDto>()).toEqual({ publicId: "pub-look-1" });
  });

  it("finds the same txHash without the 0x prefix", async () => {
    const response = await app.inject({ method: "GET", url: "/api/lookup?q=AbCd1234Ef56" });
    expect(response.statusCode).toBe(200);
    expect(response.json<LookupDto>()).toEqual({ publicId: "pub-look-1" });
  });

  it("matches txHash case-insensitively", async () => {
    const response = await app.inject({ method: "GET", url: "/api/lookup?q=0XABCD1234EF56" });
    expect(response.statusCode).toBe(200);
    expect(response.json<LookupDto>()).toEqual({ publicId: "pub-look-1" });
  });

  it("answers not_found for a mismatch row even when queried by its txHash", async () => {
    const byPublicId = await app.inject({ method: "GET", url: "/api/lookup?q=pub-look-mismatch" });
    expect(byPublicId.statusCode).toBe(404);
    expect(byPublicId.json().error.code).toBe("not_found");
    const byTxHash = await app.inject({ method: "GET", url: "/api/lookup?q=0xBadBadBad00" });
    expect(byTxHash.statusCode).toBe(404);
    expect(byTxHash.json().error.code).toBe("not_found");
  });

  it("answers not_found for a pending row of an agent without a verified activity", async () => {
    const response = await app.inject({ method: "GET", url: "/api/lookup?q=pub-look-hidden-pending" });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("not_found");
  });

  it("answers a not_found error envelope for an unknown query", async () => {
    const response = await app.inject({ method: "GET", url: "/api/lookup?q=no-such-thing" });
    expect(response.statusCode).toBe(404);
    const body = response.json<{ error: { code: string; message: string } }>();
    expect(body.error.code).toBe("not_found");
    expect(typeof body.error.message).toBe("string");
  });
});
