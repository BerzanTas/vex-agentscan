import { canonicalAttestMessage } from "@agentscan/contract";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { recoverAttestSigner } from "../recover-attest-signer.js";

describe("recoverAttestSigner", () => {
  it("recovers the signer address for a message signed by viem signMessage over the canonical format", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const tokenAddress = "0xabc0000000000000000000000000000000dead";
    const message = canonicalAttestMessage(4663n, tokenAddress);
    const signature = await account.signMessage({ message });

    const recovered = await recoverAttestSigner(message, signature);

    expect(recovered).toBe(account.address.toLowerCase());
  });

  it("returns null when the signature does not recover to a valid address", async () => {
    const message = canonicalAttestMessage(4663n, "0xabc0000000000000000000000000000000dead");
    const garbageSignature = `0x${"a".repeat(130)}` as const;

    const recovered = await recoverAttestSigner(message, garbageSignature);

    expect(recovered).toBeNull();
  });

  it("returns a different signer when the signature was produced over a different message", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const signedMessage = canonicalAttestMessage(4663n, "0xabc0000000000000000000000000000000dead");
    const signature = await account.signMessage({ message: signedMessage });
    const otherMessage = canonicalAttestMessage(4663n, "0xdef0000000000000000000000000000000beef");

    const recovered = await recoverAttestSigner(otherMessage, signature);

    expect(recovered).not.toBe(account.address.toLowerCase());
  });
});
