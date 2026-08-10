export function formatRawAmount(raw: string, decimals: number): string {
  const value = BigInt(raw);
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const remainder = value % base;
  if (remainder === 0n) return whole.toString();
  const fraction = remainder.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole.toString()}.${fraction}`;
}

export function formatRawAmountDisplay(raw: string, decimals: number): string {
  const full = formatRawAmount(raw, decimals);
  const [whole = "0", fraction] = full.split(".");
  if (fraction === undefined) return full;
  const visible = fraction.slice(0, fractionDigitsFor(whole, fraction)).replace(/0+$/, "");
  return visible === "" ? whole : `${whole}.${visible}`;
}

function fractionDigitsFor(whole: string, fraction: string): number {
  if (BigInt(whole) >= 1000n) return 2;
  if (BigInt(whole) >= 1n) return 4;
  const leadingZeroCount = fraction.length - fraction.replace(/^0+/, "").length;
  return leadingZeroCount + 4;
}

const COMPACT_USD_THRESHOLD = 1000;

const compactUsdFormatter = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatUsdAmount(usd: string): string {
  const [whole = "0", fraction = ""] = usd.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${grouped}.${fraction.slice(0, 2).padEnd(2, "0")}`;
}

export function formatUsdCompact(usd: string): string {
  const value = Number(usd);
  if (!Number.isFinite(value) || Math.abs(value) < COMPACT_USD_THRESHOLD) {
    return formatUsdAmount(usd);
  }
  return compactUsdFormatter.format(value);
}

export function formatAge(ageSeconds: number): string {
  if (ageSeconds < 60) return `${ageSeconds}s`;
  if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)}m`;
  if (ageSeconds < 86400) return `${Math.floor(ageSeconds / 3600)}h`;
  return `${Math.floor(ageSeconds / 86400)}d`;
}

export function formatLatency(seconds: number): string {
  if (seconds < 1) return `${seconds.toFixed(2)}s`;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const wholeMinutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds - wholeMinutes * 60);
  if (wholeMinutes < 60) return remainder === 0 ? `${wholeMinutes}m` : `${wholeMinutes}m ${remainder}s`;
  const wholeHours = Math.floor(wholeMinutes / 60);
  const leftoverMinutes = wholeMinutes - wholeHours * 60;
  return leftoverMinutes === 0 ? `${wholeHours}h` : `${wholeHours}h ${leftoverMinutes}m`;
}
