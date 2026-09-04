import { describe, expect, it } from "vitest";
import { attestRequestSchema, canonicalAttestMessage } from "../index.js";

const validSignature = `0x${"a".repeat(130)}`;
const validAddress = `0xAbC${"0".repeat(33)}dEaD`;
const validTxHash = `0x${"b".repeat(64)}`;

const goldenRequest = {
  chainId: 4663,
  tokenAddress: validAddress,
  attestSignature: validSignature,
};

describe("attestRequestSchema", () => {
  // The default is what makes an old client and a new server compatible: every attestation written
  // before the field existed is a Trench one, and every client shipped before it means Trench.
  it("accepts the golden body without a txHash, defaulting the launchpad to trench", () => {
    const parsed = attestRequestSchema.parse(goldenRequest);
    expect(parsed).toEqual({
      chainId: 4663n,
      launchpad: "trench",
      tokenAddress: validAddress,
      attestSignature: validSignature,
    });
  });

  it.each(["pools_fun", "virtuals"] as const)("accepts an explicit %s launchpad", (launchpad) => {
    expect(attestRequestSchema.parse({ ...goldenRequest, launchpad }).launchpad).toBe(launchpad);
  });

  // An unrecognised launchpad is REFUSED, never defaulted: silently verifying a claim under the
  // wrong proof is exactly the confusion the field exists to remove.
  it("rejects a launchpad outside the enum rather than falling back to the default", () => {
    expect(attestRequestSchema.safeParse({ ...goldenRequest, launchpad: "uniswap" }).success).toBe(false);
  });

  it("accepts an optional txHash", () => {
    const parsed = attestRequestSchema.parse({ ...goldenRequest, txHash: validTxHash });
    expect(parsed.txHash).toBe(validTxHash);
  });

  it("strips unknown keys", () => {
    const parsed = attestRequestSchema.parse({ ...goldenRequest, futureField: "x" });
    expect("futureField" in parsed).toBe(false);
  });

  it("accepts a mixed-case tokenAddress (lowercasing happens downstream, not in the schema)", () => {
    const parsed = attestRequestSchema.parse(goldenRequest);
    expect(parsed.tokenAddress).toBe(validAddress);
  });

  it("rejects a signature that is one hex character short", () => {
    const shortSignature = `0x${"a".repeat(129)}`;
    expect(attestRequestSchema.safeParse({ ...goldenRequest, attestSignature: shortSignature }).success).toBe(
      false,
    );
  });

  it("rejects a signature that is one hex character long", () => {
    const longSignature = `0x${"a".repeat(131)}`;
    expect(attestRequestSchema.safeParse({ ...goldenRequest, attestSignature: longSignature }).success).toBe(
      false,
    );
  });

  it("rejects a tokenAddress that is not 40 hex characters", () => {
    expect(
      attestRequestSchema.safeParse({ ...goldenRequest, tokenAddress: "0xabc" }).success,
    ).toBe(false);
  });

  it("rejects a tokenAddress missing the 0x prefix", () => {
    expect(
      attestRequestSchema.safeParse({ ...goldenRequest, tokenAddress: validAddress.slice(2) }).success,
    ).toBe(false);
  });

  it("rejects a txHash that is not 32 bytes", () => {
    expect(attestRequestSchema.safeParse({ ...goldenRequest, txHash: "0xabc" }).success).toBe(false);
  });

  it("rejects chainId zero", () => {
    expect(attestRequestSchema.safeParse({ ...goldenRequest, chainId: 0 }).success).toBe(false);
  });

  it("rejects a negative chainId", () => {
    expect(attestRequestSchema.safeParse({ ...goldenRequest, chainId: -1 }).success).toBe(false);
  });

  it("rejects a non-integer chainId", () => {
    expect(attestRequestSchema.safeParse({ ...goldenRequest, chainId: 4663.5 }).success).toBe(false);
  });
});

describe("canonicalAttestMessage", () => {
  const lowercaseAddress = validAddress.toLowerCase();

  it("formats chainId as a decimal with no leading zeros and lowercases the address", () => {
    expect(canonicalAttestMessage(4663n, validAddress)).toBe(`VEX-attest:4663:${lowercaseAddress}`);
  });

  it("formats a large chainId without scientific notation or grouping", () => {
    expect(canonicalAttestMessage(792703809n, lowercaseAddress)).toBe(
      `VEX-attest:792703809:${lowercaseAddress}`,
    );
  });
});
