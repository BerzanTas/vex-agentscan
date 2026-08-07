import { describe, expect, it } from "vitest";
import { isStrikeEligibleKind, resolveVerificationTier } from "../verification/verification-policy.js";

describe("resolveVerificationTier", () => {
  it("caps a launch activity at basic even on a full-tier chain", () => {
    expect(resolveVerificationTier("launch", "full")).toBe("basic");
  });
  it("keeps a launch activity at basic on a basic-tier chain", () => {
    expect(resolveVerificationTier("launch", "basic")).toBe("basic");
  });
  it("passes the chain tier through unchanged for a swap", () => {
    expect(resolveVerificationTier("swap", "full")).toBe("full");
    expect(resolveVerificationTier("swap", "basic")).toBe("basic");
  });
  it("passes the chain tier through unchanged for a bridge", () => {
    expect(resolveVerificationTier("bridge", "full")).toBe("full");
    expect(resolveVerificationTier("bridge", "basic")).toBe("basic");
  });
});

describe("isStrikeEligibleKind", () => {
  it("excludes launch from strike eligibility", () => {
    expect(isStrikeEligibleKind("launch")).toBe(false);
  });
  it("keeps swap strike-eligible", () => {
    expect(isStrikeEligibleKind("swap")).toBe(true);
  });
  it("keeps bridge strike-eligible", () => {
    expect(isStrikeEligibleKind("bridge")).toBe(true);
  });
});
