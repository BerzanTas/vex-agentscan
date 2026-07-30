export function formatRawAmount(raw: string, decimals: number): string {
  const value = BigInt(raw);
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const remainder = value % base;
  if (remainder === 0n) return whole.toString();
  const fraction = remainder.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole.toString()}.${fraction}`;
}

const DISPLAY_SIGNIFICANT_FRACTION_DIGITS = 6;

export function formatRawAmountDisplay(raw: string, decimals: number): string {
  const full = formatRawAmount(raw, decimals);
  const [whole, fraction] = full.split(".");
  if (fraction === undefined) return full;
  const leadingZeroCount = fraction.length - fraction.replace(/^0+/, "").length;
  const visibleDigits = leadingZeroCount + DISPLAY_SIGNIFICANT_FRACTION_DIGITS;
  if (fraction.length <= visibleDigits) return full;
  return `${whole}.${fraction.slice(0, visibleDigits)}`;
}

export function formatUsdEstimate(usd: string): string {
  const [whole = "0", fraction = ""] = usd.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = fraction.slice(0, 2).replace(/0+$/, "");
  return cents === "" ? grouped : `${grouped}.${cents}`;
}

export function formatAge(ageSeconds: number): string {
  if (ageSeconds < 60) return `${ageSeconds}s`;
  if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)}m`;
  if (ageSeconds < 86400) return `${Math.floor(ageSeconds / 3600)}h`;
  return `${Math.floor(ageSeconds / 86400)}d`;
}
