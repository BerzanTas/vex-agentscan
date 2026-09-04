import { describe, expect, it } from "vitest";
import {
  isLaunchShaped,
  resolveVerificationTier,
  type VerificationKind,
} from "../verification/verification-policy.js";

// The tier is resolved from the kind AND the role, so every case names a role that really belongs
// to its kind rather than a placeholder: a role from the wrong kind would make the assertions prove
// nothing about the pairs the ingest contract can actually produce.
const ROLE_OF: Record<VerificationKind, string> = {
  swap: "swap",
  bridge: "bridge_deposit",
  lend: "lend_deposit",
  prediction: "predict_buy",
  wrap: "wrap",
  yield: "yield_pt",
  launch: "token_launch",
  claim: "pools_claim",
  transfer: "wallet_transfer",
};

describe("resolveVerificationTier", () => {
  it("caps a launch activity at basic even on a full-tier chain", () => {
    expect(resolveVerificationTier("launch", ROLE_OF["launch"], "full")).toBe("basic");
  });
  it("keeps a launch activity at basic on a basic-tier chain", () => {
    expect(resolveVerificationTier("launch", ROLE_OF["launch"], "basic")).toBe("basic");
  });
  it("passes the chain tier through unchanged for a swap", () => {
    expect(resolveVerificationTier("swap", ROLE_OF["swap"], "full")).toBe("full");
    expect(resolveVerificationTier("swap", ROLE_OF["swap"], "basic")).toBe("basic");
  });
  it("passes the chain tier through unchanged for a bridge", () => {
    expect(resolveVerificationTier("bridge", ROLE_OF["bridge"], "full")).toBe("full");
    expect(resolveVerificationTier("bridge", ROLE_OF["bridge"], "basic")).toBe("basic");
  });
  it("caps a wrap activity at basic even on a full-tier chain", () => {
    expect(resolveVerificationTier("wrap", ROLE_OF["wrap"], "full")).toBe("basic");
  });
  it("caps a transfer at basic even on a full-tier chain, because the kind covers NFT sends the full verifier cannot decode", () => {
    expect(resolveVerificationTier("transfer", ROLE_OF["transfer"], "full")).toBe("basic");
  });
  it("keeps a transfer at basic on a basic-tier chain", () => {
    expect(resolveVerificationTier("transfer", ROLE_OF["transfer"], "basic")).toBe("basic");
  });
  it.each(["lend", "prediction", "yield", "claim"] as const)(
    "passes the chain tier through unchanged for a %s",
    (kind) => {
      expect(resolveVerificationTier(kind, ROLE_OF[kind], "full")).toBe("full");
      expect(resolveVerificationTier(kind, ROLE_OF[kind], "basic")).toBe("basic");
    },
  );

  // A permissionless distribute pays the token's HOLDERS, not the caller. The full verifier proves
  // an amount by matching a declared leg against the receipt's transfers, and there is no leg of
  // the caller's to match, so full tier would strike an honest transaction three times and
  // quarantine the installation.
  it("caps a reward_distribution at basic even though its claim kind follows the chain tier", () => {
    expect(resolveVerificationTier("claim", "reward_distribution", "full")).toBe("basic");
    expect(resolveVerificationTier("claim", "reward_distribution", "basic")).toBe("basic");
  });

  // The two claims that DO pay the caller keep the chain's tier: they declare real legs, and both
  // of them are now checked against the receipt.
  it.each(["creator_fee_claim", "holder_reward_claim"] as const)(
    "leaves a %s on the chain tier, because it declares legs the verifier can prove",
    (role) => {
      expect(resolveVerificationTier("claim", role, "full")).toBe("full");
    },
  );

  // Not by a role rule of its own: the launch KIND is capped at basic in full, and a cancel is a
  // launch. The assertion pins the outcome the arc requires, whichever rule delivers it.
  it("verifies a launch_cancel at basic", () => {
    expect(resolveVerificationTier("launch", "launch_cancel", "full")).toBe("basic");
  });

  // A fee leg is verified like any other row - the fold is a read-model decision, not a
  // verification one - so it follows its parent kind's tier.
  it("leaves a vex_fee leg on its kind's tier", () => {
    expect(resolveVerificationTier("swap", "vex_fee", "full")).toBe("full");
    expect(resolveVerificationTier("launch", "vex_fee", "full")).toBe("basic");
  });
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
  it.each(["lend", "prediction", "wrap", "yield", "claim", "transfer"] as const)(
    "rejects the %s kind, which claims no strike exemption",
    (kind) => {
      expect(isLaunchShaped(kind, "token_launch")).toBe(false);
    },
  );
});
