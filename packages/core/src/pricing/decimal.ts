const integerPattern = /^\d+$/;
const decimalPattern = /^\d+(\.\d+)?$/;
const MAX_TOKEN_DECIMALS = 255;

type ScaledInteger = { mantissa: bigint; scale: number };

function scaledIntegerFrom(decimalText: string): ScaledInteger | null {
  if (!decimalPattern.test(decimalText)) return null;
  const [wholePart = "", fractionPart = ""] = decimalText.split(".");
  return { mantissa: BigInt(`${wholePart}${fractionPart}`), scale: fractionPart.length };
}

function decimalTextFrom(value: bigint, scale: number): string {
  if (scale === 0) return value.toString();
  const digits = value.toString().padStart(scale + 1, "0");
  const wholePart = digits.slice(0, digits.length - scale);
  const fractionPart = digits.slice(digits.length - scale).replace(/0+$/, "");
  return fractionPart.length === 0 ? wholePart : `${wholePart}.${fractionPart}`;
}

export function legUsd(args: { executedRaw: string; decimals: number; priceUsd: string }): string | null {
  if (!integerPattern.test(args.executedRaw)) return null;
  if (!Number.isInteger(args.decimals) || args.decimals < 0 || args.decimals > MAX_TOKEN_DECIMALS) return null;
  const price = scaledIntegerFrom(args.priceUsd);
  if (price === null) return null;
  return decimalTextFrom(BigInt(args.executedRaw) * price.mantissa, args.decimals + price.scale);
}

export function plainDecimalFrom(value: number): string | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const text = value.toString();
  const [mantissaText = "", exponentText] = text.split(/[eE]/);
  if (exponentText === undefined) return mantissaText;
  const [wholePart = "", fractionPart = ""] = mantissaText.split(".");
  const digits = `${wholePart}${fractionPart}`;
  const pointIndex = wholePart.length + Number(exponentText);
  if (pointIndex <= 0) return `0.${"0".repeat(-pointIndex)}${digits}`;
  if (pointIndex >= digits.length) return `${digits}${"0".repeat(pointIndex - digits.length)}`;
  return `${digits.slice(0, pointIndex)}.${digits.slice(pointIndex)}`;
}
