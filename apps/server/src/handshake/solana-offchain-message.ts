const SOLANA_OFFCHAIN_PREFIX_BYTE = 0xff;
const SOLANA_OFFCHAIN_ASCII_TAG = "solana offchain";

export function solanaOffchainMessageBytes(template: string): Uint8Array {
  const tagBytes = Buffer.from(SOLANA_OFFCHAIN_ASCII_TAG, "ascii");
  const templateBytes = Buffer.from(template, "utf8");
  return Buffer.concat([Buffer.from([SOLANA_OFFCHAIN_PREFIX_BYTE]), tagBytes, templateBytes]);
}
