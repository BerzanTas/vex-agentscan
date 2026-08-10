import { recoverMessageAddress, type Hex } from "viem";

export async function recoverAttestSigner(message: string, signature: Hex): Promise<string | null> {
  try {
    const address = await recoverMessageAddress({ message, signature });
    return address.toLowerCase();
  } catch {
    return null;
  }
}
