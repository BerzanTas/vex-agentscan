import type { ChartPointDto } from "./api";

export function volumeValues(series: ChartPointDto[]): number[] {
  return series.map((point) => Number(point.volumeUsd));
}

export function txValues(series: ChartPointDto[]): number[] {
  return series.map((point) => point.txCount);
}

export function cumulativeSeriesEndingAt(values: number[], total: number): number[] {
  const contributed = values.reduce((sum, value) => sum + value, 0);
  let running = Math.max(total - contributed, 0);
  return values.map((value) => (running += value));
}
