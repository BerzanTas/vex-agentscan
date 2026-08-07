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
});
