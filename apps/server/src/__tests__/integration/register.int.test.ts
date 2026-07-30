import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadConfig } from "../../config.js";
import { startTestDb } from "../../testing/pg-harness.js";

const token = "A".repeat(43);
const otherToken = "B".repeat(43);
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const validRegister = {
  agentHash: "a".repeat(64),
  ingestToken: token,
  consentVersion: 1,
  acceptedAt: new Date().toISOString(),
  appVersion: "0.1.0",
};
const purgedAtSentinel = "2026-01-01T00:00:00.000Z";
const rateLimitedIp = "203.0.113.5";

let db: Awaited<ReturnType<typeof startTestDb>>;
let app: FastifyInstance;

beforeAll(async () => {
  db = await startTestDb();
  const config = loadConfig({
    DATABASE_URL: "postgres://unused-in-tests",
    REGISTER_RATE_LIMIT_PER_IP: "10",
    REGISTER_RATE_WINDOW_SEC: "3600",
  });
  app = await buildApp({ pool: db.pool, config, resolveChain: () => null });
});

afterAll(async () => {
  await app.close();
  await db.stop();
});

const register = (payload: unknown, remoteAddress?: string) =>
  app.inject({
    method: "POST",
    url: "/v1/agents/register",
    payload: payload as object,
    ...(remoteAddress ? { remoteAddress } : {}),
  });

const revoke = (bearer: string) =>
  app.inject({
    method: "POST",
    url: "/v1/agents/revoke",
    headers: { authorization: `Bearer ${bearer}` },
    payload: {},
  });

const agentRow = async () => {
  const result = await db.pool.query(
    "SELECT * FROM agents WHERE agent_hash = $1",
    [validRegister.agentHash],
  );
  return result.rows[0];
};

describe("POST /v1/agents/register", () => {
  it("registers a fresh agent and accepts an identical re-register", async () => {
    const first = await register(validRegister);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ status: "registered" });
    const second = await register(validRegister);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ status: "registered" });
  });

  it("rejects the same agentHash with a different token as agent_conflict", async () => {
    const response = await register({ ...validRegister, ingestToken: otherToken });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("agent_conflict");
    const row = await agentRow();
    expect(row.ingest_token_sha256).toBe(sha256hex(token));
  });

  it("revokes via bearer token and stays idempotent", async () => {
    const first = await revoke(token);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ status: "revoked" });
    const second = await revoke(token);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ status: "revoked" });
    const row = await agentRow();
    expect(row.status).toBe("revoked");
    expect(row.revoked_at).not.toBeNull();
  });

  it("re-register after revoke reactivates the agent without touching purged_at", async () => {
    await db.pool.query("UPDATE agents SET purged_at = $2 WHERE agent_hash = $1", [
      validRegister.agentHash,
      purgedAtSentinel,
    ]);
    const response = await register(validRegister);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "registered" });
    const row = await agentRow();
    expect(row.status).toBe("active");
    expect(row.revoked_at).toBeNull();
    expect(new Date(row.purged_at).toISOString()).toBe(purgedAtSentinel);
  });

  it("stores a consentVersion bump and never downgrades it", async () => {
    const bump = await register({ ...validRegister, consentVersion: 2 });
    expect(bump.statusCode).toBe(200);
    expect((await agentRow()).consent_version).toBe(2);
    const downgrade = await register({ ...validRegister, consentVersion: 1 });
    expect(downgrade.statusCode).toBe(200);
    expect((await agentRow()).consent_version).toBe(2);
  });

  it("stores only the sha256 of the token, never the plaintext", async () => {
    const row = await agentRow();
    expect(row.ingest_token_sha256).toBe(sha256hex(token));
    const allRows = await db.pool.query("SELECT * FROM agents");
    expect(JSON.stringify(allRows.rows)).not.toContain(token);
  });

  it("rejects a malformed body with validation_failed", async () => {
    const response = await register({ agentHash: "not-a-hash" });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("validation_failed");
  });

  it("rate limits the 11th register from the same IP with a Retry-After header", async () => {
    const limitedRegister = {
      ...validRegister,
      agentHash: "c".repeat(64),
      ingestToken: "C".repeat(43),
    };
    for (let i = 0; i < 10; i++) {
      const response = await register(limitedRegister, rateLimitedIp);
      expect(response.statusCode).toBe(200);
    }
    const eleventh = await register(limitedRegister, rateLimitedIp);
    expect(eleventh.statusCode).toBe(429);
    expect(eleventh.json().error.code).toBe("rate_limited");
    const retryAfterSec = Number(eleventh.headers["retry-after"]);
    expect(retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(retryAfterSec).toBeLessThanOrEqual(3600);
  });
});
