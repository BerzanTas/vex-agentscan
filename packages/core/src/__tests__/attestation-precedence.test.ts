import { describe, expect, it } from "vitest";
import {
  attestationSignalsFor,
  bestAttestationCandidate,
  displayStatusOf,
  type AttestationCandidate,
} from "../attestation-precedence.js";

const at = (isoDate: string) => new Date(isoDate);

const candidate = (overrides: Partial<AttestationCandidate> & { id: string }): AttestationCandidate & {
  id: string;
} => ({
  verifyStatus: "unverified",
  revokedAt: null,
  firstSeenAt: at("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

describe("displayStatusOf", () => {
  it("reports the underlying verify status when not revoked", () => {
    expect(displayStatusOf(candidate({ id: "a", verifyStatus: "verified" }))).toBe("verified");
  });

  it("reports revoked regardless of the underlying verify status", () => {
    expect(
      displayStatusOf(candidate({ id: "a", verifyStatus: "verified", revokedAt: at("2026-02-01T00:00:00.000Z") })),
    ).toBe("revoked");
  });
});

describe("bestAttestationCandidate", () => {
  it("returns null for an empty candidate list", () => {
    expect(bestAttestationCandidate([])).toBeNull();
  });

  it("picks the sole candidate when there is only one", () => {
    const only = candidate({ id: "a" });
    expect(bestAttestationCandidate([only])).toBe(only);
  });

  it("prefers verified over unverified", () => {
    const unverified = candidate({ id: "a", verifyStatus: "unverified" });
    const verified = candidate({ id: "b", verifyStatus: "verified" });
    expect(bestAttestationCandidate([unverified, verified])).toBe(verified);
  });

  it("prefers unverified over mismatch and unverifiable", () => {
    const mismatch = candidate({ id: "a", verifyStatus: "mismatch" });
    const unverifiable = candidate({ id: "b", verifyStatus: "unverifiable" });
    const unverified = candidate({ id: "c", verifyStatus: "unverified" });
    expect(bestAttestationCandidate([mismatch, unverifiable, unverified])).toBe(unverified);
  });

  it("a verified-but-revoked row loses to another signer's non-revoked verified row", () => {
    const revokedVerified = candidate({
      id: "a",
      verifyStatus: "verified",
      revokedAt: at("2026-02-01T00:00:00.000Z"),
    });
    const liveVerified = candidate({ id: "b", verifyStatus: "verified" });
    expect(bestAttestationCandidate([revokedVerified, liveVerified])).toBe(liveVerified);
  });

  it("a revoked row beats nothing: it wins only when it is the sole candidate", () => {
    const revoked = candidate({ id: "a", verifyStatus: "verified", revokedAt: at("2026-02-01T00:00:00.000Z") });
    expect(bestAttestationCandidate([revoked])).toBe(revoked);
  });

  it("revoked ranks below unverified, mismatch, and unverifiable", () => {
    const revoked = candidate({ id: "a", verifyStatus: "verified", revokedAt: at("2026-02-01T00:00:00.000Z") });
    const mismatch = candidate({ id: "b", verifyStatus: "mismatch" });
    expect(bestAttestationCandidate([revoked, mismatch])).toBe(mismatch);
  });

  it("breaks ties between equally ranked candidates by earliest first_seen_at", () => {
    const later = candidate({ id: "a", firstSeenAt: at("2026-01-02T00:00:00.000Z") });
    const earlier = candidate({ id: "b", firstSeenAt: at("2026-01-01T00:00:00.000Z") });
    expect(bestAttestationCandidate([later, earlier])).toBe(earlier);
  });
});

describe("attestationSignalsFor", () => {
  it("is empty for a revoked row", () => {
    expect(attestationSignalsFor("revoked")).toEqual([]);
  });

  it("is creator_attested only for an unverified row", () => {
    expect(attestationSignalsFor("unverified")).toEqual(["creator_attested"]);
  });

  it("is creator_attested only for mismatch and unverifiable rows", () => {
    expect(attestationSignalsFor("mismatch")).toEqual(["creator_attested"]);
    expect(attestationSignalsFor("unverifiable")).toEqual(["creator_attested"]);
  });

  it("includes both signals for a verified row", () => {
    expect(attestationSignalsFor("verified")).toEqual(["creator_attested", "onchain_verified"]);
  });
});
