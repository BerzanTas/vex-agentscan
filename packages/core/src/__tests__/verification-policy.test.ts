import { describe, expect, it } from "vitest";
import { isLaunchShaped, resolveVerificationTier } from "../verification/verification-policy.js";

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
  it("caps a wrap activity at basic even on a full-tier chain", () => {
    expect(resolveVerificationTier("wrap", "full")).toBe("basic");
  });
  it.each(["lend", "prediction", "yield"] as const)(
    "passes the chain tier through unchanged for a %s",
    (kind) => {
      expect(resolveVerificationTier(kind, "full")).toBe("full");
      expect(resolveVerificationTier(kind, "basic")).toBe("basic");
    },
  );
});

describe("isLaunchShaped", () => {
  it("matches a genuine launch event declaring the token_launch role", () => {
    expect(isLaunchShaped("launch", "token_launch")).toBe(true);
  });
  it("rejects a launch kind paired with a non-launch role", () => {
    expect(isLaunchShaped("launch", "swap")).toBe(false);
  });
  it("rejects a swap kind even when paired with the token_launch role", () => {
    expect(isLaunchShaped("swap", "token_launch")).toBe(false);
  });
  it("rejects a bridge kind paired with its own role", () => {
    expect(isLaunchShaped("bridge", "bridge_deposit")).toBe(false);
  });
  it.each(["lend", "prediction", "wrap", "yield"] as const)(
    "rejects the %s kind, which claims no strike exemption",
    (kind) => {
      expect(isLaunchShaped(kind, "token_launch")).toBe(false);
    },
  );
});
