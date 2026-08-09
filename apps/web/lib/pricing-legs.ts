export function legCount(count: number): string {
  return count === 1 ? "1 swap or bridge deposit" : `${count} swaps and bridge deposits`;
}
