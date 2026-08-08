import { describe, expect, it } from "vitest";
import { addressHmacHex, normalizeHandshakeAddress } from "../wallet-hmac.js";

const pepper = "p".repeat(32);

describe("normalizeHandshakeAddress", () => {
  it("lowercases an EVM address", () => {
    expect(normalizeHandshakeAddress("eip155", "0xABC000000000000000000000000000000000DEAD")).toBe(
      "0xabc000000000000000000000000000000000dead",
    );
  });

  it("keeps a Solana address verbatim", () => {
    const address = "5GWSs49R1vXTeKehaxKzzbVQGjG1PVWhpxiug81jDDdX";
    expect(normalizeHandshakeAddress("solana", address)).toBe(address);
  });
});

describe("addressHmacHex", () => {
  it("produces the same hmac for an EVM address regardless of case", () => {
    const lower = addressHmacHex(
      pepper,
      "eip155",
      normalizeHandshakeAddress("eip155", "0xabc000000000000000000000000000000000dead"),
    );
    const upper = addressHmacHex(
      pepper,
      "eip155",
      normalizeHandshakeAddress("eip155", "0xABC000000000000000000000000000000000DEAD"),
    );
    expect(lower).toBe(upper);
  });

  it("produces a different hmac for a Solana address when case differs", () => {
    const original = addressHmacHex(pepper, "solana", "5GWSs49R1vXTeKehaxKzzbVQGjG1PVWhpxiug81jDDdX");
    const differentCase = addressHmacHex(pepper, "solana", "5gwss49r1vxtekehaxkzzbvqgjg1pvwhpxiug81jddx");
    expect(original).not.toBe(differentCase);
  });

  it("produces different hmacs for the same address string across chain families", () => {
    const evmHmac = addressHmacHex(pepper, "eip155", "sharedvalue");
    const solanaHmac = addressHmacHex(pepper, "solana", "sharedvalue");
    expect(evmHmac).not.toBe(solanaHmac);
  });

  it("produces a different hmac under a different pepper", () => {
    const first = addressHmacHex(pepper, "eip155", "0xabc000000000000000000000000000000000dead");
    const second = addressHmacHex("q".repeat(32), "eip155", "0xabc000000000000000000000000000000000dead");
    expect(first).not.toBe(second);
  });

  it("returns a 64-character lowercase hex digest", () => {
    const hmac = addressHmacHex(pepper, "eip155", "0xabc000000000000000000000000000000000dead");
    expect(hmac).toMatch(/^[0-9a-f]{64}$/);
  });
});
