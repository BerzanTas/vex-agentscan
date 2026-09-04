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
  | "claim"
  | "transfer";

type KindVerificationPolicy = {
  tierCap: VerificationTier | null;
  strikeExemptRoles: readonly string[];
};

const followsChainTier: KindVerificationPolicy = { tierCap: null, strikeExemptRoles: [] };

/**
 * Roles capped at basic INSIDE a kind whose other roles follow the chain's tier.
 *
 * The full verifier proves a declared amount by finding it among the receipt's ERC-20 Transfer
 * logs, matched against the leg the activity declares. `reward_distribution` has no such leg to
 * match: `distribute()` is permissionless, it pays the token's holders rather than the caller, and
 * the transfers in its receipt name addresses the activity never declared. Judging it at full tier
 * would produce an amount mismatch on an honest transaction, and three of those quarantine an
 * installation. Basic still proves the transaction exists on the chain it claims and did not
 * revert, which is the whole of what a distribute asserts.
 *
 * `launch_cancel` needs no entry: the launch kind is already capped at basic in full.
 */
const BASIC_TIER_ROLES: readonly string[] = ["reward_distribution"];

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
  // A transfer is capped at basic on its first ship, the way a wrap is. The kind covers every
  // wallet send the client can make, including ERC-721 and ERC-1155 sends, while the full verifier
  // only models native value and the ERC-20 Transfer log. Reading an NFT send at full tier would
  // produce amount and time mismatches against a shape the verifier does not know how to decode,
  // and three such strikes quarantine an honest installation. Basic still proves the transaction
  // exists on the chain it claims and did not revert. The cap can be lifted once the verifier
  // models token-standard sends.
  transfer: { tierCap: "basic", strikeExemptRoles: [] },
};

export function resolveVerificationTier(
  kind: VerificationKind,
  eventRole: string,
  chainTier: VerificationInput["tier"],
): VerificationInput["tier"] {
  if (BASIC_TIER_ROLES.includes(eventRole)) return "basic";
  return kindVerificationPolicies[kind].tierCap ?? chainTier;
}

export function isLaunchShaped(kind: VerificationKind, eventRole: string): boolean {
  return kindVerificationPolicies[kind].strikeExemptRoles.includes(eventRole);
}
