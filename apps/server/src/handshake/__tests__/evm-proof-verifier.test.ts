import { handshakeChallengeTemplate } from "@agentscan/contract";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { EvmProofVerifier } from "../evm-proof-verifier.js";

const verifier = new EvmProofVerifier();

async function signedTemplate(address: string) {
  const template = handshakeChallengeTemplate({
    domain: "localhost",
    agentHash: "a".repeat(64),
    address,
    chainFamily: "eip155",
    nonce: "n".repeat(43),
    issuedAt: "2026-08-08T00:00:00.000Z",
  });
  return template;
}

describe("EvmProofVerifier", () => {
  it("accepts a signature produced by the address's own private key", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const template = await signedTemplate(account.address.toLowerCase());
    const signature = await account.signMessage({ message: template });

    const ok = await verifier.verify({ template, address: account.address.toLowerCase(), signature });

    expect(ok).toBe(true);
  });

  it("accepts a mixed-case address argument for the same signer", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const template = await signedTemplate(account.address.toLowerCase());
    const signature = await account.signMessage({ message: template });

    const ok = await verifier.verify({ template, address: account.address, signature });

    expect(ok).toBe(true);
  });

  it("rejects a signature produced by a different key", async () => {
    const signer = privateKeyToAccount(generatePrivateKey());
    const claimedAddress = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
    const template = await signedTemplate(claimedAddress);
    const signature = await signer.signMessage({ message: template });

    const ok = await verifier.verify({ template, address: claimedAddress, signature });

    expect(ok).toBe(false);
  });

  it("rejects a signature over a different template (e.g. tampered nonce)", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const signedOver = await signedTemplate(account.address.toLowerCase());
    const signature = await account.signMessage({ message: signedOver });
    const tamperedTemplate = signedOver.replace(/Nonce: .+/, "Nonce: tampered-nonce-value");

    const ok = await verifier.verify({ template: tamperedTemplate, address: account.address, signature });

    expect(ok).toBe(false);
  });

  it("returns false instead of throwing for a malformed signature", async () => {
    const template = await signedTemplate("0xabc000000000000000000000000000000000dead");

    const ok = await verifier.verify({
      template,
      address: "0xabc000000000000000000000000000000000dead",
      signature: "0xnotasignature",
    });

    expect(ok).toBe(false);
  });
});
