import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadConfig } from "../../config.js";
import { startTestDb } from "../../testing/pg-harness.js";

let db: Awaited<ReturnType<typeof startTestDb>>;
let app: FastifyInstance;

beforeAll(async () => {
  db = await startTestDb();
  const config = loadConfig({ DATABASE_URL: "postgres://unused-in-tests" });
  app = await buildApp({ pool: db.pool, config, resolveChain: () => null });
});

afterAll(async () => {
  await app.close();
  await db.stop();
});

describe("GET /healthz", () => {
  it("reports db ok with null worker age when no heartbeat exists", async () => {
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ db: "ok", workerAgeSec: null });
    expect(response.headers["strict-transport-security"]).toBe(
      "max-age=31536000; includeSubDomains",
    );
    expect(response.headers["content-security-policy"]).toBe(
      "default-src 'self'; script-src 'self' 'unsafe-inline'",
    );
  });

  it("returns 503 unhealthy in strict mode when the heartbeat is stale", async () => {
    await db.pool.query(
      "INSERT INTO worker_heartbeat (worker_name, beat_at) VALUES ('verifier', now() - interval '10 minutes')",
    );
    const response = await app.inject({ method: "GET", url: "/healthz?strict=1" });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("unhealthy");
  });

  it("keeps answering 200 without strict despite a stale heartbeat", async () => {
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    expect(response.json().db).toBe("ok");
    expect(response.json().workerAgeSec).toBeGreaterThan(590);
  });
});

describe("unknown routes", () => {
  it("answers 404 with the not_found error envelope", async () => {
    const response = await app.inject({ method: "GET", url: "/no-such-route" });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("not_found");
  });
});
