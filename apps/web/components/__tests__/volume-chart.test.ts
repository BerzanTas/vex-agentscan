import { describe, expect, it } from "vitest";
import {
  formatBucketMoment,
  formatBucketValue,
  resolveBucketSpan,
  tooltipPosition,
} from "../VolumeChart";
import type { ChartPointDto } from "../../lib/api";

const MIDNIGHT = Date.UTC(2026, 7, 6) / 1000;
const HOUR = 3600;

function bucketsEvery(seconds: number, count: number): ChartPointDto[] {
  return Array.from({ length: count }, (_unused, index) => ({
    bucketStart: MIDNIGHT + index * seconds,
    volumeUsd: "0",
    txCount: 0,
  }));
}

const point: ChartPointDto = { bucketStart: MIDNIGHT, volumeUsd: "12045.44", txCount: 1234 };

describe("resolveBucketSpan", () => {
  it("reads hourly buckets as an intraday span", () => {
    expect(resolveBucketSpan(bucketsEvery(HOUR, 24))).toBe("hour");
  });

  it("reads six-hour buckets as an intraday span", () => {
    expect(resolveBucketSpan(bucketsEvery(6 * HOUR, 28))).toBe("hour");
  });

  it("reads daily buckets as a daily span", () => {
    expect(resolveBucketSpan(bucketsEvery(24 * HOUR, 30))).toBe("day");
  });

  it("falls back to a daily span when there is a single bucket", () => {
    expect(resolveBucketSpan(bucketsEvery(HOUR, 1))).toBe("day");
  });
});

describe("formatBucketMoment", () => {
  it("names a daily bucket by its date in the en locale", () => {
    expect(formatBucketMoment(MIDNIGHT, "day")).toBe("Aug 6, 2026");
  });

  it("adds the UTC time to an intraday bucket", () => {
    expect(formatBucketMoment(MIDNIGHT + 14 * HOUR, "hour")).toBe("Aug 6, 14:00 UTC");
  });
});

describe("formatBucketValue", () => {
  it("marks a volume value as an estimate", () => {
    expect(formatBucketValue(point, "volume")).toBe("$12,045.44 est.");
  });

  it("shows a grouped integer without the estimate marker for transactions", () => {
    expect(formatBucketValue(point, "txns")).toBe("1,234");
  });
});

describe("tooltipPosition", () => {
  const tooltip = { width: 120, height: 40 };
  const frame = { width: 600, height: 320 };

  it("sits above and right of the cursor when there is room", () => {
    expect(tooltipPosition({ x: 100, y: 100 }, tooltip, frame)).toEqual({ x: 114, y: 46 });
  });

  it("flips to the left of the cursor at the right edge", () => {
    expect(tooltipPosition({ x: 560, y: 100 }, tooltip, frame)).toEqual({ x: 426, y: 46 });
  });

  it("drops below the cursor at the top edge", () => {
    expect(tooltipPosition({ x: 100, y: 20 }, tooltip, frame)).toEqual({ x: 114, y: 34 });
  });

  it("stays inside a frame narrower than the tooltip", () => {
    expect(tooltipPosition({ x: 10, y: 10 }, tooltip, { width: 100, height: 50 })).toEqual({
      x: 0,
      y: 10,
    });
  });
});
