import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { buildApp } from "../../app.js";
import { loadConfig } from "../../config.js";
import { resolveChain } from "@agentscan/core";
import { startTestDb } from "../../testing/pg-harness.js";

let stop: () => Promise<void>;
let pool: pg.Pool;
let app: FastifyInstance;

const registerBody = (agentHash: string, ingestToken: string) => ({
  agentHash,
  ingestToken,
  consentVersion: 1,
  acceptedAt: "2026-08-05T10:00:00.000Z",
});

beforeAll(async () => {
  const started = await startTestDb();
  pool = started.pool;
  stop = started.stop;
  const config = loadConfig({
    DATABASE_URL: "postgres://unused",
    TRUST_PROXY: "127.0.0.1",
    REGISTER_RATE_LIMIT_PER_IP: "2",
    REGISTER_RATE_WINDOW_SEC: "3600",
    AGENT_ALIAS_SALT: "salt-alias",
    RATE_LIMIT_KEY_SALT: "salt-rate",
  });
  app = await buildApp({ pool, config, resolveChain });
}, 120_000);

afterAll(async () => {
  await app.close();
  await stop();
});

describe("trustProxy", () => {
  it("liczy limit rejestracji osobno dla każdego adresu z x-forwarded-for", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/v1/agents/register",
      headers: { "x-forwarded-for": "203.0.113.10" },
      payload: registerBody("a".repeat(64), "A".repeat(43)),
    });
    const second = await app.inject({
      method: "POST",
      url: "/v1/agents/register",
      headers: { "x-forwarded-for": "203.0.113.10" },
      payload: registerBody("b".repeat(64), "B".repeat(43)),
    });
    const third = await app.inject({
      method: "POST",
      url: "/v1/agents/register",
      headers: { "x-forwarded-for": "203.0.113.10" },
      payload: registerBody("c".repeat(64), "C".repeat(43)),
    });
    const otherClient = await app.inject({
      method: "POST",
      url: "/v1/agents/register",
      headers: { "x-forwarded-for": "203.0.113.99" },
      payload: registerBody("d".repeat(64), "D".repeat(43)),
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(third.statusCode).toBe(429);
    expect(otherClient.statusCode).toBe(200);
  });
});
