import { describe, expect, it } from "vitest";
import { rangeWindowSeconds, resolveChartRange } from "../chart-range.js";

describe("resolveChartRange", () => {
  it("maps 24h to twenty four hourly buckets from raw activities", () => {
    expect(resolveChartRange("24h")).toEqual({
      source: "activities",
      bucketSeconds: 3600,
      bucketCount: 24,
    });
  });

  it("maps 7d to twenty eight six-hour buckets from raw activities", () => {
    expect(resolveChartRange("7d")).toEqual({
      source: "activities",
      bucketSeconds: 21600,
      bucketCount: 28,
    });
  });

  it("maps 30d to thirty daily buckets from aggregates", () => {
    expect(resolveChartRange("30d")).toEqual({ source: "aggregates", days: 30 });
  });

  it("maps all to unbounded daily buckets from aggregates", () => {
    expect(resolveChartRange("all")).toEqual({ source: "aggregates", days: null });
  });

  it("falls back to 30d for an unknown range", () => {
    expect(resolveChartRange("42h")).toEqual({ source: "aggregates", days: 30 });
  });

  it("falls back to 30d for a missing range", () => {
    expect(resolveChartRange(undefined)).toEqual({ source: "aggregates", days: 30 });
  });
});

describe("rangeWindowSeconds", () => {
  it("derives a day from the hourly bucket plan", () => {
    expect(rangeWindowSeconds(resolveChartRange("24h"))).toBe(86_400);
  });

  it("derives a week from the six-hourly bucket plan", () => {
    expect(rangeWindowSeconds(resolveChartRange("7d"))).toBe(604_800);
  });

  it("derives thirty days from the aggregate plan", () => {
    expect(rangeWindowSeconds(resolveChartRange("30d"))).toBe(2_592_000);
  });

  it("leaves the all-time range unbounded", () => {
    expect(rangeWindowSeconds(resolveChartRange("all"))).toBeNull();
  });
});
