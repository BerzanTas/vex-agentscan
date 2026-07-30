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
