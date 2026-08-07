import { describe, expect, it } from "vitest";
import type { ChartPointDto } from "../api";
import { cumulativeSeriesEndingAt, txValues, volumeValues } from "../stat-series";

const SERIES: ChartPointDto[] = [
  { bucketStart: 1_754_179_200, volumeUsd: "100.50", txCount: 3 },
  { bucketStart: 1_754_265_600, volumeUsd: "200.25", txCount: 5 },
  { bucketStart: 1_754_352_000, volumeUsd: "300.25", txCount: 7 },
];

describe("volumeValues", () => {
  it("reads the usd volume of every bucket in order", () => {
    expect(volumeValues(SERIES)).toEqual([100.5, 200.25, 300.25]);
  });

  it("yields nothing for an empty series", () => {
    expect(volumeValues([])).toEqual([]);
  });
});

describe("txValues", () => {
  it("reads the transaction count of every bucket in order", () => {
    expect(txValues(SERIES)).toEqual([3, 5, 7]);
  });
});

describe("cumulativeSeriesEndingAt", () => {
  it("ends exactly at the reported total", () => {
    expect(cumulativeSeriesEndingAt([3, 5, 7], 5271).at(-1)).toBe(5271);
  });

  it("starts above zero when history predates the series", () => {
    expect(cumulativeSeriesEndingAt([3, 5, 7], 5271)).toEqual([5259, 5264, 5271]);
  });

  it("starts at the first bucket when the series is the whole history", () => {
    expect(cumulativeSeriesEndingAt([3, 5, 7], 15)).toEqual([3, 8, 15]);
  });

  it("keeps the baseline at zero when the series outgrows the total", () => {
    expect(cumulativeSeriesEndingAt([3, 5, 7], 4)).toEqual([3, 8, 15]);
  });

  it("yields nothing for an empty series", () => {
    expect(cumulativeSeriesEndingAt([], 5271)).toEqual([]);
  });
});
