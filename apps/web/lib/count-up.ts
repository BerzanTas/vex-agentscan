import { formatUsdCompact, formatUsdAmount } from "./format";

export const COUNT_UP_MS = 1500;
export const COUNT_UP_THRESHOLD = 0.4;

export type CountUpKind = "usd" | "usdCompact" | "count";

export function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

export function countUpText(kind: CountUpKind, value: number): string {
  if (kind === "usd") return `$${formatUsdAmount(value.toFixed(2))}`;
  if (kind === "usdCompact") return `$${formatUsdCompact(value.toFixed(2))}`;
  return Math.round(value).toLocaleString("en-US");
}
