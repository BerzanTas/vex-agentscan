import { handshakeChallengeTemplate } from "@agentscan/contract";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { describe, expect, it } from "vitest";
import { SolanaProofVerifier } from "../solana-proof-verifier.js";

const verifier = new SolanaProofVerifier();

function templateFor(address: string) {
  return handshakeChallengeTemplate({
    domain: "localhost",
    agentHash: "a".repeat(64),
    address,
    chainFamily: "solana",
    nonce: "n".repeat(43),
    issuedAt: "2026-08-08T00:00:00.000Z",
  });
}

function signOffchain(secretKey: Uint8Array, template: string): string {
  const prefix = Buffer.from([0xff]);
  const tag = Buffer.from("solana offchain", "ascii");
  const message = Buffer.concat([prefix, tag, Buffer.from(template, "utf8")]);
  return bs58.encode(nacl.sign.detached(message, secretKey));
}

describe("SolanaProofVerifier", () => {
  it("accepts a signature produced by the address's own keypair", async () => {
    const keyPair = nacl.sign.keyPair();
    const address = bs58.encode(keyPair.publicKey);
    const template = templateFor(address);
    const signature = signOffchain(keyPair.secretKey, template);

    const ok = await verifier.verify({ template, address, signature });

    expect(ok).toBe(true);
  });

  it("rejects a signature produced by a different keypair", async () => {
    const signerKeyPair = nacl.sign.keyPair();
    const claimedKeyPair = nacl.sign.keyPair();
    const claimedAddress = bs58.encode(claimedKeyPair.publicKey);
    const template = templateFor(claimedAddress);
    const signature = signOffchain(signerKeyPair.secretKey, template);

    const ok = await verifier.verify({ template, address: claimedAddress, signature });

    expect(ok).toBe(false);
  });

  it("rejects a signature over a different template", async () => {
    const keyPair = nacl.sign.keyPair();
    const address = bs58.encode(keyPair.publicKey);
    const signedTemplate = templateFor(address);
    const signature = signOffchain(keyPair.secretKey, signedTemplate);
    const tamperedTemplate = signedTemplate.replace(/Domain: .+/, "Domain: evil.example");

    const ok = await verifier.verify({ template: tamperedTemplate, address, signature });

    expect(ok).toBe(false);
  });

  it("rejects a signature that is missing the 0xFF offchain-message prefix", async () => {
    const keyPair = nacl.sign.keyPair();
    const address = bs58.encode(keyPair.publicKey);
    const template = templateFor(address);
    const rawSignature = nacl.sign.detached(Buffer.from(template, "utf8"), keyPair.secretKey);

    const ok = await verifier.verify({ template, address, signature: bs58.encode(rawSignature) });

    expect(ok).toBe(false);
  });

  it("returns false instead of throwing for a malformed address", async () => {
    const keyPair = nacl.sign.keyPair();
    const template = templateFor("0");
    const signature = signOffchain(keyPair.secretKey, template);

    const ok = await verifier.verify({ template, address: "0", signature });

    expect(ok).toBe(false);
  });

  it("returns false instead of throwing for a malformed signature", async () => {
    const keyPair = nacl.sign.keyPair();
    const address = bs58.encode(keyPair.publicKey);
    const template = templateFor(address);

    const ok = await verifier.verify({ template, address, signature: "not-base58!!" });

    expect(ok).toBe(false);
  });
});
