import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { resolveChain } from "@agentscan/core";
import { buildApp } from "../../app.js";
import { loadConfig } from "../../config.js";
import { startTestDb } from "../../testing/pg-harness.js";

let db: Awaited<ReturnType<typeof startTestDb>>;
let pool: pg.Pool;

beforeAll(async () => {
  db = await startTestDb();
  pool = db.pool;
}, 120_000);

afterAll(async () => {
  await db.stop();
});

describe("prywatność kluczy limitu tempa", () => {
  it("nie zapisuje surowego adresu IP ani surowego tokena", async () => {
    const config = loadConfig({ DATABASE_URL: "postgres://unused" });
    const app = await buildApp({ pool, config, resolveChain });

    const response = await app.inject({
      method: "POST",
      url: "/v1/agents/register",
      remoteAddress: "203.0.113.7",
      payload: {},
    });
    expect(response.statusCode).toBe(400);

    const stored = await pool.query<{ key_hash: string }>("SELECT key_hash FROM rate_limit_hits");
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]?.key_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.rows[0]?.key_hash).not.toContain("203.0.113.7");

    await app.close();
  });
});
