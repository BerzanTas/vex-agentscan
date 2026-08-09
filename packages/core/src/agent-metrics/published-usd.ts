import { ZERO_DECIMAL, decimalFromText, decimalToText, type Decimal } from "./decimal.js";

const CENT_UNIT = 10n ** 16n;

function roundedToCents(value: Decimal): Decimal {
  const negative = value < ZERO_DECIMAL;
  const magnitude = negative ? -value : value;
  const remainder = magnitude % CENT_UNIT;
  const carry = remainder * 2n >= CENT_UNIT ? CENT_UNIT : ZERO_DECIMAL;
  const rounded = magnitude - remainder + carry;
  return negative ? -rounded : rounded;
}

export function publishedUsd(text: string): string {
  return decimalToText(roundedToCents(decimalFromText(text)));
}
