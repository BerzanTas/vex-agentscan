export type LegNames = {
  eventRole: string;
  tokenInSymbol: string | null;
  tokenOutSymbol: string | null;
};

export function roleLabel(eventRole: string): string {
  return eventRole.replace(/_/g, " ");
}

// A Morpho Blue market operation settles as ONE leg: supplying or repaying carries only the spent
// token, borrowing or withdrawing collateral only the received one. A Merkl or Pendle claim is the
// same shape. Printing the role instead names all four market operations "lend borrow operate", so
// a single-leg row names the token and the side the row actually proves.
export function legLabel(row: LegNames, pairSeparator: string): string {
  if (row.tokenInSymbol !== null && row.tokenOutSymbol !== null) {
    return `${row.tokenInSymbol}${pairSeparator}${row.tokenOutSymbol}`;
  }
  if (row.tokenInSymbol !== null) return `${row.tokenInSymbol} in`;
  if (row.tokenOutSymbol !== null) return `${row.tokenOutSymbol} out`;
  return roleLabel(row.eventRole);
}
