import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";

const baseEnv = { DATABASE_URL: "postgres://agentscan:agentscan@localhost:5432/agentscan" };

const deployEnvExamplePath = fileURLToPath(new URL("../../../../deploy/.env.example", import.meta.url));

function parseDotEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    env[trimmed.slice(0, separatorIndex)] = trimmed.slice(separatorIndex + 1);
  }
  return env;
}

describe("loadConfig", () => {
  it("defaults QUARANTINE_STRIKES to 3", () => {
    expect(loadConfig(baseEnv).QUARANTINE_STRIKES).toBe(3);
  });

  it("defaults PUBLIC_AGENT_PAGE_SIZE to 25", () => {
    expect(loadConfig(baseEnv).PUBLIC_AGENT_PAGE_SIZE).toBe(25);
  });

  it("defaults PUBLIC_TOKEN_PAGE_SIZE to 25", () => {
    expect(loadConfig(baseEnv).PUBLIC_TOKEN_PAGE_SIZE).toBe(25);
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

  it("builds attestAllowlistOverrides from ATTEST_FACTORY_ADDRESSES_<chainId>_<launchpad> env vars", () => {
    const config = loadConfig({
      ...baseEnv,
      ATTEST_FACTORY_ADDRESSES_4663_TRENCH: "0xfactory1,0xfactory2",
      ATTEST_FACTORY_ADDRESSES_4663_POOLS_FUN: "0xgateway1",
      // A typo in the launchpad name is IGNORED rather than accepted under a guessed name: an
      // allowlist nobody reviewed is the one thing this key must never create.
      ATTEST_FACTORY_ADDRESSES_4663_TRENCHH: "0xtypo",
      ATTEST_FACTORY_ADDRESSES_NOTANUMBER_TRENCH: "0xbad",
    });
    expect(config.attestAllowlistOverrides.get("4663:trench")).toEqual(["0xfactory1", "0xfactory2"]);
    expect(config.attestAllowlistOverrides.get("4663:pools_fun")).toEqual(["0xgateway1"]);
    expect([...config.attestAllowlistOverrides.keys()].sort()).toEqual(["4663:pools_fun", "4663:trench"]);
  });

  it("leaves attestAllowlistOverrides empty when no such env var is set", () => {
    expect(loadConfig(baseEnv).attestAllowlistOverrides.size).toBe(0);
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

  describe("deploy/.env.example (C3: was missing the production-guarded handshake vars)", () => {
    const deployEnv = parseDotEnv(readFileSync(deployEnvExamplePath, "utf8"));
    const withDocumentedSecretPlaceholdersReplaced = {
      ...deployEnv,
      AGENT_ALIAS_SALT: "operator-real-alias-salt",
      RATE_LIMIT_KEY_SALT: "operator-real-rate-salt",
      WALLET_HMAC_PEPPER: "operator-real-wallet-hmac-pepper-value",
    };

    it("is checked in with NODE_ENV=production, the setting that makes the production guards live", () => {
      expect(deployEnv.NODE_ENV).toBe("production");
    });

    it("declares every handshake var this round added", () => {
      expect(deployEnv.HANDSHAKE_RATE_LIMIT_PER_IP).toBe("10");
      expect(deployEnv.HANDSHAKE_RATE_WINDOW_SEC).toBe("3600");
      expect(deployEnv.HANDSHAKE_CHALLENGE_TTL_MIN).toBe("5");
      expect(deployEnv.HANDSHAKE_DOMAIN).toBeDefined();
      expect(deployEnv.WALLET_HMAC_PEPPER).toBeDefined();
    });

    it("pins HANDSHAKE_DOMAIN to the bare hostname of SITE_ADDRESS (M1)", () => {
      expect(deployEnv.HANDSHAKE_DOMAIN).toBe(deployEnv.SITE_ADDRESS);
      expect(deployEnv.HANDSHAKE_DOMAIN).not.toMatch(/^https?:\/\//);
      expect(deployEnv.HANDSHAKE_DOMAIN).not.toMatch(/[:/]/);
    });

    it("once an operator has replaced every documented secret placeholder, this round's additions load cleanly under loadConfig", () => {
      const config = loadConfig(withDocumentedSecretPlaceholdersReplaced);
      expect(config.HANDSHAKE_DOMAIN).toBe(deployEnv.SITE_ADDRESS);
      expect(config.ATTEST_CANDIDATES_MAX).toBe(50);
      expect(config.ATTEST_BACKOFF_SCHEDULE).toEqual(["1m", "5m", "30m", "2h", "12h"]);
    });

    it("as checked in, still refuses to boot: AGENT_ALIAS_SALT, RATE_LIMIT_KEY_SALT and WALLET_HMAC_PEPPER are all placeholders an operator must replace, same fail-closed discipline as the salts already had before this round", () => {
      expect(deployEnv.AGENT_ALIAS_SALT).toBe("agentscan-dev-salt");
      expect(deployEnv.RATE_LIMIT_KEY_SALT).toBe("agentscan-dev-rate-salt");
      expect(deployEnv.WALLET_HMAC_PEPPER).toBe("agentscan-dev-wallet-hmac-pepper");
      expect(() => loadConfig(deployEnv)).toThrow();
    });
  });
});
