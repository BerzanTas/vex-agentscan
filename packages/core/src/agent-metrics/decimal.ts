const SCALE = 18;
const SCALE_UNIT = 10n ** BigInt(SCALE);
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

export type Decimal = bigint;

export const ZERO_DECIMAL: Decimal = 0n;

export function decimalFromText(text: string): Decimal {
  if (!DECIMAL_PATTERN.test(text)) throw new Error(`malformed decimal: ${text}`);
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const scaledFraction = fraction.padEnd(SCALE, "0").slice(0, SCALE);
  const units = BigInt(whole) * SCALE_UNIT + BigInt(scaledFraction === "" ? "0" : scaledFraction);
  return negative ? -units : units;
}

export function decimalFromRawAmount(raw: string, tokenDecimals: number): Decimal {
  if (!/^\d+$/.test(raw)) throw new Error(`malformed raw amount: ${raw}`);
  if (!Number.isInteger(tokenDecimals) || tokenDecimals < 0) {
    throw new Error(`malformed token decimals: ${tokenDecimals}`);
  }
  if (tokenDecimals <= SCALE) return BigInt(raw) * 10n ** BigInt(SCALE - tokenDecimals);
  return BigInt(raw) / 10n ** BigInt(tokenDecimals - SCALE);
}

export function addDecimal(left: Decimal, right: Decimal): Decimal {
  return left + right;
}

export function subtractDecimal(left: Decimal, right: Decimal): Decimal {
  return left - right;
}

export function proportionOfDecimal(value: Decimal, part: Decimal, whole: Decimal): Decimal {
  if (whole === ZERO_DECIMAL) throw new Error("cannot take a proportion of an empty whole");
  return (value * part) / whole;
}

export function smallerDecimal(left: Decimal, right: Decimal): Decimal {
  return left < right ? left : right;
}

export function isPositiveDecimal(value: Decimal): boolean {
  return value > ZERO_DECIMAL;
}

export function decimalToText(value: Decimal): string {
  const sign = value < ZERO_DECIMAL ? "-" : "";
  const units = value < ZERO_DECIMAL ? -value : value;
  const fraction = (units % SCALE_UNIT).toString().padStart(SCALE, "0").replace(/0+$/, "");
  const whole = (units / SCALE_UNIT).toString();
  return fraction === "" ? `${sign}${whole}` : `${sign}${whole}.${fraction}`;
}
