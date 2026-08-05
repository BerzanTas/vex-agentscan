import { fastify } from "fastify";
import { describe, expect, it } from "vitest";
import { errorEnvelope } from "../plugins/error-envelope.js";

async function appThrowing(error: Error) {
  const app = fastify();
  await app.register(errorEnvelope, { poolTimeoutRetryAfterSec: 7 });
  app.get("/probe", async () => {
    throw error;
  });
  return app;
}

describe("errorEnvelope", () => {
  it("zamienia przekroczenie czasu pobrania połączenia w 503 z retry-after", async () => {
    const app = await appThrowing(new Error("timeout exceeded when trying to connect"));
    const response = await app.inject({ method: "GET", url: "/probe" });
    expect(response.statusCode).toBe(503);
    expect(response.headers["retry-after"]).toBe("7");
    expect(response.json()).toEqual({
      error: { code: "database_unavailable", message: "database connection pool exhausted" },
    });
    await app.close();
  });

  it("pozostawia inne wyjątki jako 500 bez retry-after", async () => {
    const app = await appThrowing(new Error("boom"));
    const response = await app.inject({ method: "GET", url: "/probe" });
    expect(response.statusCode).toBe(500);
    expect(response.headers["retry-after"]).toBeUndefined();
    expect(response.json()).toEqual({
      error: { code: "internal", message: "internal server error" },
    });
    await app.close();
  });
});
