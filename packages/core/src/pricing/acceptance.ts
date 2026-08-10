import { isPositiveDecimalText } from "./decimal.js";
import type { PricePoint } from "./price-feed.js";

export type PriceAcceptanceGate = { minConfidence: number; maxDriftSec: number };

export function isPriceAcceptable(
  point: PricePoint,
  anchorSecond: number,
  gate: PriceAcceptanceGate,
): boolean {
  if (!isPositiveDecimalText(point.priceUsd)) return false;
  if (point.confidence < gate.minConfidence) return false;
  return Math.abs(point.atSecond - anchorSecond) <= gate.maxDriftSec;
}
