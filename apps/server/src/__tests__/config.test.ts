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

  it("throws when VERIFY_FAKE_MODE=confirm_all runs in production", () => {
    expect(() =>
      loadConfig({ ...baseEnv, VERIFY_FAKE_MODE: "confirm_all", NODE_ENV: "production" }),
    ).toThrow();
  });
});
