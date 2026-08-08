import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";

const baseEnv = { DATABASE_URL: "postgres://agentscan:agentscan@localhost:5432/agentscan" };

describe("loadConfig", () => {
  it("defaults QUARANTINE_STRIKES to 3", () => {
    expect(loadConfig(baseEnv).QUARANTINE_STRIKES).toBe(3);
  });

  it("overrides QUARANTINE_STRIKES from env", () => {
    expect(loadConfig({ ...baseEnv, QUARANTINE_STRIKES: "5" }).QUARANTINE_STRIKES).toBe(5);
  });

  it("throws when DATABASE_URL is missing", () => {
    expect(() => loadConfig({})).toThrow();
  });

  it("parses VERIFY_BACKOFF_SCHEDULE into a string array", () => {
    expect(loadConfig(baseEnv).VERIFY_BACKOFF_SCHEDULE).toEqual(["1m", "5m", "30m", "2h", "12h"]);
  });

  it("builds rpcUrlOverrides from RPC_URLS_<SLUG> env vars", () => {
    const config = loadConfig({ ...baseEnv, RPC_URLS_BASE: "https://a,https://b" });
    expect(config.rpcUrlOverrides.get("base")).toEqual(["https://a", "https://b"]);
  });

  it("defaults the attest rate limit, pending caps, and window", () => {
    const config = loadConfig(baseEnv);
    expect(config.ATTEST_RATE_LIMIT_PER_IP).toBe(20);
    expect(config.ATTEST_RATE_WINDOW_SEC).toBe(3600);
    expect(config.ATTEST_MAX_PENDING_PER_IP).toBe(100);
    expect(config.ATTEST_MAX_PENDING_GLOBAL).toBe(10000);
  });

  it("builds attestFactoryAddressesByChainId from ATTEST_FACTORY_ADDRESSES_<chainId> env vars", () => {
    const config = loadConfig({
      ...baseEnv,
      ATTEST_FACTORY_ADDRESSES_4663: "0xfactory1,0xfactory2",
    });
    expect(config.attestFactoryAddressesByChainId.get(4663n)).toEqual(["0xfactory1", "0xfactory2"]);
  });

  it("leaves attestFactoryAddressesByChainId empty when no such env var is set", () => {
    expect(loadConfig(baseEnv).attestFactoryAddressesByChainId.size).toBe(0);
  });

  it("throws when VERIFY_FAKE_MODE=confirm_all runs in production", () => {
    expect(() =>
      loadConfig({ ...baseEnv, VERIFY_FAKE_MODE: "confirm_all", NODE_ENV: "production" }),
    ).toThrow();
  });

  it("throws when the default AGENT_ALIAS_SALT runs in production", () => {
    expect(() => loadConfig({ ...baseEnv, NODE_ENV: "production" })).toThrow();
  });

  it("defaults the attestation worker's confirmation depth, age cap, batch, lease, and backoff schedule", () => {
    const config = loadConfig(baseEnv);
    expect(config.ATTEST_MIN_CONFIRMATIONS).toBe(5);
    expect(config.ATTEST_MAX_AGE_DAYS).toBe(14);
    expect(config.ATTEST_WORKER_BATCH).toBe(20);
    expect(config.ATTEST_WORKER_LEASE_SEC).toBe(120);
    expect(config.ATTEST_BACKOFF_SCHEDULE).toEqual(["1m", "5m", "30m", "2h", "12h"]);
  });

  it("overrides ATTEST_MIN_CONFIRMATIONS and ATTEST_MAX_AGE_DAYS from env", () => {
    const config = loadConfig({ ...baseEnv, ATTEST_MIN_CONFIRMATIONS: "12", ATTEST_MAX_AGE_DAYS: "30" });
    expect(config.ATTEST_MIN_CONFIRMATIONS).toBe(12);
    expect(config.ATTEST_MAX_AGE_DAYS).toBe(30);
  });

  it("defaults the handshake rate limit, domain, and challenge ttl", () => {
    const config = loadConfig(baseEnv);
    expect(config.HANDSHAKE_RATE_LIMIT_PER_IP).toBe(10);
    expect(config.HANDSHAKE_RATE_WINDOW_SEC).toBe(3600);
    expect(config.HANDSHAKE_DOMAIN).toBe("localhost");
    expect(config.HANDSHAKE_CHALLENGE_TTL_MIN).toBe(5);
  });

  it("overrides HANDSHAKE_RATE_LIMIT_PER_IP and HANDSHAKE_DOMAIN from env", () => {
    const config = loadConfig({
      ...baseEnv,
      HANDSHAKE_RATE_LIMIT_PER_IP: "3",
      HANDSHAKE_DOMAIN: "agentscan.example",
    });
    expect(config.HANDSHAKE_RATE_LIMIT_PER_IP).toBe(3);
    expect(config.HANDSHAKE_DOMAIN).toBe("agentscan.example");
  });

  it("accepts a HANDSHAKE_DOMAIN with a port", () => {
    expect(loadConfig({ ...baseEnv, HANDSHAKE_DOMAIN: "localhost:8080" }).HANDSHAKE_DOMAIN).toBe(
      "localhost:8080",
    );
  });

  it("rejects a HANDSHAKE_DOMAIN with characters outside the domain charset", () => {
    expect(() => loadConfig({ ...baseEnv, HANDSHAKE_DOMAIN: "https://evil.example/" })).toThrow();
    expect(() => loadConfig({ ...baseEnv, HANDSHAKE_DOMAIN: "evil example" })).toThrow();
  });

  it("throws when the default HANDSHAKE_DOMAIN runs in production", () => {
    expect(() => loadConfig({ ...baseEnv, NODE_ENV: "production" })).toThrow();
  });

  it("accepts a custom HANDSHAKE_DOMAIN in production", () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        NODE_ENV: "production",
        HANDSHAKE_DOMAIN: "agentscan.example",
        WALLET_HMAC_PEPPER: "w".repeat(32),
        AGENT_ALIAS_SALT: "custom-alias-salt",
        RATE_LIMIT_KEY_SALT: "custom-rate-salt",
      }),
    ).not.toThrow();
  });

  it("defaults WALLET_HMAC_PEPPER to a dev value at least 32 characters long", () => {
    expect(loadConfig(baseEnv).WALLET_HMAC_PEPPER.length).toBeGreaterThanOrEqual(32);
  });

  it("throws when WALLET_HMAC_PEPPER is shorter than 32 characters", () => {
    expect(() => loadConfig({ ...baseEnv, WALLET_HMAC_PEPPER: "short" })).toThrow();
  });

  it("throws when the default WALLET_HMAC_PEPPER runs in production", () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        NODE_ENV: "production",
        HANDSHAKE_DOMAIN: "agentscan.example",
        AGENT_ALIAS_SALT: "custom-alias-salt",
        RATE_LIMIT_KEY_SALT: "custom-rate-salt",
      }),
    ).toThrow();
  });
});
