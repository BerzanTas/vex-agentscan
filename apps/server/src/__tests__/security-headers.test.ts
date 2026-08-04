import { describe, expect, it } from "vitest";
import { fastify } from "fastify";
import { securityHeaders } from "../plugins/security-headers.js";

describe("securityHeaders", () => {
  it("ustawia HSTS i CSP o wartościach z Caddyfile", async () => {
    const app = fastify();
    await app.register(securityHeaders);
    app.get("/probe", async () => ({ ok: true }));

    const response = await app.inject({ method: "GET", url: "/probe" });

    expect(response.headers["strict-transport-security"]).toBe(
      "max-age=31536000; includeSubDomains",
    );
    expect(response.headers["content-security-policy"]).toBe(
      "default-src 'self'; script-src 'self' 'unsafe-inline'",
    );
  });
});
