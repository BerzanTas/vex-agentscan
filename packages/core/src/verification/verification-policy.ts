import type { VerificationInput } from "./evaluate.js";

export type VerificationKind = "swap" | "bridge" | "launch";

export function resolveVerificationTier(
  kind: VerificationKind,
  chainTier: VerificationInput["tier"],
): VerificationInput["tier"] {
  return kind === "launch" ? "basic" : chainTier;
}

export function isLaunchShaped(kind: VerificationKind, eventRole: string): boolean {
  return kind === "launch" && eventRole === "token_launch";
}
