export const EVM_NATIVE_ADDRESS = `0x${"0".repeat(40)}`;
export const EVM_NATIVE_SENTINEL = `0x${"e".repeat(40)}`;

export function isEvmNativeAddress(tokenAddress: string): boolean {
  const lowercased = tokenAddress.toLowerCase();
  return lowercased === EVM_NATIVE_ADDRESS || lowercased === EVM_NATIVE_SENTINEL;
}
