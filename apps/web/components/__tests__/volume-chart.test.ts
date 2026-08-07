import { LineStyle, PriceScaleMode, TickMarkType, type Time } from "lightweight-charts";
import { describe, expect, it } from "vitest";
import {
  baseSeriesOptions,
  crosshairTimeFormatter,
  formatBucketMoment,
  formatBucketValue,
  formatTickMark,
  priceScaleModeFor,
  priceScaleOptionsFor,
  resolveBucketSpan,
  timeScaleOptionsFor,
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

describe("baseSeriesOptions", () => {
  it("keeps the two-pixel trace and dashed reference price line on the custom area series", () => {
    expect(baseSeriesOptions()).toEqual({
      lineWidth: 2,
      priceLineVisible: true,
      priceLineStyle: LineStyle.Dashed,
    });
  });
});

const SEPTEMBER_FIRST = Date.UTC(2026, 8, 1) / 1000;
const NEXT_YEAR_START = Date.UTC(2027, 0, 1) / 1000;

describe("formatTickMark", () => {
  it("labels a time mark with the viewer's local hour in Warsaw", () => {
    expect(formatTickMark(MIDNIGHT + 13 * HOUR, "hour", TickMarkType.Time, "Europe/Warsaw")).toBe(
      "15:00",
    );
  });

  it("labels the same time mark with the viewer's local hour in New York", () => {
    expect(
      formatTickMark(MIDNIGHT + 13 * HOUR, "hour", TickMarkType.Time, "America/New_York"),
    ).toBe("09:00");
  });

  it("labels a local midnight time mark as 00:00 even when it falls before UTC midnight", () => {
    expect(formatTickMark(MIDNIGHT + 22 * HOUR, "hour", TickMarkType.Time, "Europe/Warsaw")).toBe(
      "00:00",
    );
  });

  it("labels a time mark with the plain hour for a UTC viewer", () => {
    expect(formatTickMark(MIDNIGHT + 13 * HOUR, "hour", TickMarkType.Time, "UTC")).toBe("13:00");
  });

  it("labels a day mark on an intraday series with the local date after the viewer's midnight", () => {
    expect(
      formatTickMark(MIDNIGHT + 24 * HOUR, "hour", TickMarkType.DayOfMonth, "Europe/Warsaw"),
    ).toBe("Aug 7");
  });

  it("labels a day mark on an intraday series with the local date before the viewer's midnight", () => {
    expect(
      formatTickMark(MIDNIGHT + 24 * HOUR, "hour", TickMarkType.DayOfMonth, "America/New_York"),
    ).toBe("Aug 6");
  });

  it("labels a day mark on a daily series with the UTC date regardless of the viewer zone", () => {
    expect(formatTickMark(MIDNIGHT, "day", TickMarkType.DayOfMonth, "America/New_York")).toBe(
      "Aug 6",
    );
  });

  it("rolls the daily UTC date over at the UTC midnight boundary", () => {
    expect(formatTickMark(MIDNIGHT + 24 * HOUR, "day", TickMarkType.DayOfMonth, "UTC")).toBe(
      "Aug 7",
    );
  });

  it("labels a month mark on an intraday series with the local month", () => {
    expect(
      formatTickMark(SEPTEMBER_FIRST, "hour", TickMarkType.Month, "America/New_York"),
    ).toBe("Aug");
  });

  it("labels a month mark on a daily series with the UTC month", () => {
    expect(formatTickMark(SEPTEMBER_FIRST, "day", TickMarkType.Month, "America/New_York")).toBe(
      "Sep",
    );
  });

  it("labels a year mark on an intraday series with the local year", () => {
    expect(formatTickMark(NEXT_YEAR_START, "hour", TickMarkType.Year, "America/New_York")).toBe(
      "2026",
    );
  });

  it("labels a year mark on a daily series with the UTC year", () => {
    expect(formatTickMark(NEXT_YEAR_START, "day", TickMarkType.Year, "America/New_York")).toBe(
      "2027",
    );
  });
});

describe("timeScaleOptionsFor", () => {
  it("shows times on the axis for intraday buckets", () => {
    const options = timeScaleOptionsFor("hour");

    expect(options.timeVisible).toBe(true);
    expect(options.secondsVisible).toBe(false);
  });

  it("keeps a date-only axis for daily buckets", () => {
    expect(timeScaleOptionsFor("day").timeVisible).toBe(false);
  });

  it("labels intraday ticks through the viewer-zone hour formatter", () => {
    const label = timeScaleOptionsFor("hour", "Europe/Warsaw").tickMarkFormatter?.(
      (MIDNIGHT + 13 * HOUR) as Time,
      TickMarkType.Time,
      "en-US",
    );

    expect(label).toBe("15:00");
  });

  it("labels daily ticks through the UTC date formatter regardless of the viewer zone", () => {
    const label = timeScaleOptionsFor("day", "America/New_York").tickMarkFormatter?.(
      (MIDNIGHT + 24 * HOUR) as Time,
      TickMarkType.DayOfMonth,
      "en-US",
    );

    expect(label).toBe("Aug 7");
  });

  it("labels a day mark on an intraday series with a date instead of an hour", () => {
    const label = timeScaleOptionsFor("hour", "Europe/Warsaw").tickMarkFormatter?.(
      (MIDNIGHT + 24 * HOUR) as Time,
      TickMarkType.DayOfMonth,
      "en-US",
    );

    expect(label).toBe("Aug 7");
  });
});

describe("crosshairTimeFormatter", () => {
  it("renders the crosshair label exactly like the intraday tooltip moment", () => {
    const label = crosshairTimeFormatter("hour", "Europe/Warsaw")((MIDNIGHT + 8 * HOUR) as Time);

    expect(label).toBe("Aug 6, 10:00 GMT+2");
  });

  it("renders the crosshair label as the UTC date for daily buckets regardless of the viewer zone", () => {
    const label = crosshairTimeFormatter("day", "America/New_York")(MIDNIGHT as Time);

    expect(label).toBe("Aug 6, 2026");
  });
});

describe("priceScaleModeFor", () => {
  it("maps the linear choice to the normal price scale mode", () => {
    expect(priceScaleModeFor("linear")).toBe(PriceScaleMode.Normal);
  });

  it("maps the log choice to the logarithmic price scale mode", () => {
    expect(priceScaleModeFor("log")).toBe(PriceScaleMode.Logarithmic);
  });
});

describe("priceScaleOptionsFor", () => {
  it("keeps the same top headroom in both modes so toggling never jumps the layout", () => {
    expect(priceScaleOptionsFor("linear").scaleMargins).toEqual({ top: 0.1, bottom: 0.1 });
    expect(priceScaleOptionsFor("log").scaleMargins).toEqual({ top: 0.1, bottom: 0.1 });
  });

  it("hides edge labels that would render partially in both modes", () => {
    expect(priceScaleOptionsFor("linear").entireTextOnly).toBe(true);
    expect(priceScaleOptionsFor("log").entireTextOnly).toBe(true);
  });

  it("carries the chosen scale mode", () => {
    expect(priceScaleOptionsFor("linear").mode).toBe(PriceScaleMode.Normal);
    expect(priceScaleOptionsFor("log").mode).toBe(PriceScaleMode.Logarithmic);
  });
});

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
  it("names a daily bucket by its UTC date regardless of the viewer zone", () => {
    expect(formatBucketMoment(MIDNIGHT, "day", "America/New_York")).toBe("Aug 6, 2026");
  });

  it("renders an intraday bucket in the viewer zone with an explicit zone name", () => {
    expect(formatBucketMoment(MIDNIGHT + 8 * HOUR, "hour", "Europe/Warsaw")).toBe(
      "Aug 6, 10:00 GMT+2",
    );
  });

  it("keeps rendering UTC when the viewer zone is UTC", () => {
    expect(formatBucketMoment(MIDNIGHT + 14 * HOUR, "hour", "UTC")).toBe("Aug 6, 14:00 UTC");
  });

  it("rolls the local date forward when the zone crosses midnight before UTC", () => {
    expect(formatBucketMoment(MIDNIGHT + 22 * HOUR, "hour", "Europe/Warsaw")).toBe(
      "Aug 7, 00:00 GMT+2",
    );
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
