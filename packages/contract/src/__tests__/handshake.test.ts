import { describe, expect, it } from "vitest";
import {
  handshakeChallengeTemplate,
  handshakeSessionCompleteRequestSchema,
  handshakeSessionStartRequestSchema,
} from "../handshake.js";

const agentHash = "a".repeat(64);
const nonce = "n".repeat(43);

describe("handshakeChallengeTemplate", () => {
  it("builds the byte-exact template for an EVM proof", () => {
    const template = handshakeChallengeTemplate({
      domain: "localhost",
      agentHash,
      address: "0xabc000000000000000000000000000000000dead",
      chainFamily: "eip155",
      nonce,
      issuedAt: "2026-08-08T00:00:00.000Z",
    });

    expect(template).toBe(
      "AgentScan Handshake v1\n" +
        "Domain: localhost\n" +
        `Agent: ${agentHash}\n` +
        "Address: 0xabc000000000000000000000000000000000dead\n" +
        "Chain-Family: eip155\n" +
        `Nonce: ${nonce}\n` +
        "Issued-At: 2026-08-08T00:00:00.000Z",
    );
  });

  it("builds the byte-exact template for a Solana proof, keeping the address verbatim", () => {
    const solanaAddress = "5GWSs49R1vXTeKehaxKzzbVQGjG1PVWhpxiug81jDDdX";
    const template = handshakeChallengeTemplate({
      domain: "agentscan.example",
      agentHash,
      address: solanaAddress,
      chainFamily: "solana",
      nonce,
      issuedAt: "2026-08-08T00:00:00.000Z",
    });

    expect(template).toBe(
      "AgentScan Handshake v1\n" +
        "Domain: agentscan.example\n" +
        `Agent: ${agentHash}\n` +
        `Address: ${solanaAddress}\n` +
        "Chain-Family: solana\n" +
        `Nonce: ${nonce}\n` +
        "Issued-At: 2026-08-08T00:00:00.000Z",
    );
  });

  it("never appends a trailing newline", () => {
    const template = handshakeChallengeTemplate({
      domain: "localhost",
      agentHash,
      address: "0xabc000000000000000000000000000000000dead",
      chainFamily: "eip155",
      nonce,
      issuedAt: "2026-08-08T00:00:00.000Z",
    });

    expect(template.endsWith("\n")).toBe(false);
    expect(template.split("\n")).toHaveLength(7);
  });
});

const evmEntry = (address: string) => ({ chainFamily: "eip155" as const, address });
const solanaEntry = (address: string) => ({ chainFamily: "solana" as const, address });

describe("handshakeSessionStartRequestSchema", () => {
  it("accepts a mixed set of up to 3 EVM and 3 Solana addresses", () => {
    const result = handshakeSessionStartRequestSchema.safeParse({
      agentHash,
      addresses: [
        evmEntry("0xabc000000000000000000000000000000000dead"),
        evmEntry("0xabc000000000000000000000000000000000beef"),
        solanaEntry("5GWSs49R1vXTeKehaxKzzbVQGjG1PVWhpxiug81jDDdX"),
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects more than 3 addresses in the same chain family", () => {
    const result = handshakeSessionStartRequestSchema.safeParse({
      agentHash,
      addresses: [
        evmEntry("0xaaa000000000000000000000000000000000dead"),
        evmEntry("0xbbb000000000000000000000000000000000dead"),
        evmEntry("0xccc000000000000000000000000000000000dead"),
        evmEntry("0xddd000000000000000000000000000000000dead"),
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a duplicate address within the same chain family", () => {
    const result = handshakeSessionStartRequestSchema.safeParse({
      agentHash,
      addresses: [
        evmEntry("0xABC000000000000000000000000000000000DEAD"),
        evmEntry("0xabc000000000000000000000000000000000dead"),
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty addresses array", () => {
    expect(handshakeSessionStartRequestSchema.safeParse({ agentHash, addresses: [] }).success).toBe(
      false,
    );
  });

  it("rejects a malformed EVM address", () => {
    const result = handshakeSessionStartRequestSchema.safeParse({
      agentHash,
      addresses: [evmEntry("0xnotanaddress")],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed Solana address", () => {
    const result = handshakeSessionStartRequestSchema.safeParse({
      agentHash,
      addresses: [solanaEntry("0")],
    });
    expect(result.success).toBe(false);
  });
});

describe("handshakeSessionCompleteRequestSchema", () => {
  const validCompleteBody = {
    challengeId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    agentHash,
    consentVersion: 1,
    proofs: [
      {
        chainFamily: "eip155" as const,
        address: "0xabc000000000000000000000000000000000dead",
        signature: `0x${"1".repeat(130)}`,
        issuedAt: "2026-08-08T00:00:00.000Z",
      },
    ],
  };

  it("accepts a well-formed completion body", () => {
    expect(handshakeSessionCompleteRequestSchema.safeParse(validCompleteBody).success).toBe(true);
  });

  it("rejects a non-uuid challengeId", () => {
    const result = handshakeSessionCompleteRequestSchema.safeParse({
      ...validCompleteBody,
      challengeId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects consentVersion below 1", () => {
    const result = handshakeSessionCompleteRequestSchema.safeParse({
      ...validCompleteBody,
      consentVersion: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an appVersion longer than 32 characters", () => {
    const result = handshakeSessionCompleteRequestSchema.safeParse({
      ...validCompleteBody,
      appVersion: "v".repeat(33),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed EVM proof signature", () => {
    const result = handshakeSessionCompleteRequestSchema.safeParse({
      ...validCompleteBody,
      proofs: [{ ...validCompleteBody.proofs[0], signature: "0xtooshort" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a well-formed Solana proof", () => {
    const result = handshakeSessionCompleteRequestSchema.safeParse({
      ...validCompleteBody,
      proofs: [
        {
          chainFamily: "solana",
          address: "5GWSs49R1vXTeKehaxKzzbVQGjG1PVWhpxiug81jDDdX",
          signature: "3".repeat(88),
          issuedAt: "2026-08-08T00:00:00.000Z",
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
