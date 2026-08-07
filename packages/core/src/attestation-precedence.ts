export type AttestationVerifyStatus = "unverified" | "verified" | "mismatch" | "unverifiable";
export type AttestationDisplayStatus = AttestationVerifyStatus | "revoked";
export type AttestationSignal = "creator_attested" | "onchain_verified";

export type AttestationCandidate = {
  verifyStatus: AttestationVerifyStatus;
  revokedAt: Date | null;
  firstSeenAt: Date;
};

const DISPLAY_STATUS_RANK: Record<AttestationDisplayStatus, number> = {
  verified: 0,
  unverified: 1,
  mismatch: 2,
  unverifiable: 2,
  revoked: 3,
};

export function displayStatusOf(candidate: AttestationCandidate): AttestationDisplayStatus {
  return candidate.revokedAt !== null ? "revoked" : candidate.verifyStatus;
}

export function bestAttestationCandidate<T extends AttestationCandidate>(candidates: T[]): T | null {
  return candidates.reduce<T | null>((best, candidate) => {
    if (best === null) return candidate;
    const bestRank = DISPLAY_STATUS_RANK[displayStatusOf(best)];
    const candidateRank = DISPLAY_STATUS_RANK[displayStatusOf(candidate)];
    if (candidateRank < bestRank) return candidate;
    if (candidateRank > bestRank) return best;
    return candidate.firstSeenAt.getTime() < best.firstSeenAt.getTime() ? candidate : best;
  }, null);
}

export function attestationSignalsFor(status: AttestationDisplayStatus): AttestationSignal[] {
  if (status === "revoked") return [];
  if (status === "verified") return ["creator_attested", "onchain_verified"];
  return ["creator_attested"];
}
