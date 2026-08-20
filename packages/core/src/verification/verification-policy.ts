import type { VerificationInput } from "./evaluate.js";

type VerificationTier = VerificationInput["tier"];

export type VerificationKind =
  | "swap"
  | "bridge"
  | "lend"
  | "prediction"
  | "wrap"
  | "yield"
  | "launch"
  | "claim";

type KindVerificationPolicy = {
  tierCap: VerificationTier | null;
  strikeExemptRoles: readonly string[];
};

const followsChainTier: KindVerificationPolicy = { tierCap: null, strikeExemptRoles: [] };

const kindVerificationPolicies: Record<VerificationKind, KindVerificationPolicy> = {
  swap: followsChainTier,
  bridge: followsChainTier,
  lend: followsChainTier,
  prediction: followsChainTier,
  wrap: { tierCap: "basic", strikeExemptRoles: [] },
  yield: followsChainTier,
  launch: { tierCap: "basic", strikeExemptRoles: ["token_launch"] },
  // A claim is an ordinary receipt-provable transfer: it has a hash, it either landed or it did
  // not, so it follows the chain's tier and claims no strike exemption.
  claim: followsChainTier,
};

export function resolveVerificationTier(
  kind: VerificationKind,
  chainTier: VerificationInput["tier"],
): VerificationInput["tier"] {
  return kindVerificationPolicies[kind].tierCap ?? chainTier;
}

export function isLaunchShaped(kind: VerificationKind, eventRole: string): boolean {
  return kindVerificationPolicies[kind].strikeExemptRoles.includes(eventRole);
}
