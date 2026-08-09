"use client";

import {
  ColorType,
  createChart,
  LineStyle,
  PriceScaleMode,
  TickMarkType,
  type DeepPartial,
  type ChartOptions,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type PriceScaleOptions,
  type SeriesPartialOptions,
  type Time,
  type TimeScaleOptions,
  type UTCTimestamp,
  type WhitespaceData,
} from "lightweight-charts";
import { useCallback, useEffect, useRef } from "react";
import type { ChartPointDto } from "../lib/api";
import {
  MonotoneAreaSeries,
  type MonotoneAreaData,
  type MonotoneAreaSeriesOptions,
} from "./MonotoneAreaSeries";
import { chartPalette, type ChartPalette } from "../lib/chart-theme";
import { formatUsdAmount } from "../lib/format";
import { resolveTheme } from "../lib/theme";

export type ChartMetric = "volume" | "txns";

export type BucketSpan = "hour" | "day";

export type ChartScale = "linear" | "log";

const CHART_FONT_FAMILY = "JetBrains Mono, ui-monospace, monospace";
const LINE_WIDTH = 2;
const DAY_SECONDS = 86_400;
const TOOLTIP_CURSOR_GAP = 14;

const DAILY_MOMENT_FORMAT = new Intl.DateTimeFormat("en", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

function zoneFormatFamily(
  options: Intl.DateTimeFormatOptions,
): (timeZone: string) => Intl.DateTimeFormat {
  const formats = new Map<string, Intl.DateTimeFormat>();
  return (timeZone) => {
    const cached = formats.get(timeZone);
    if (cached !== undefined) return cached;
    const format = new Intl.DateTimeFormat("en", { ...options, timeZone });
    formats.set(timeZone, format);
    return format;
  };
}

const hourlyMomentFormat = zoneFormatFamily({
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZoneName: "short",
});

const hourlyTickFormat = zoneFormatFamily({
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function viewerTimeZone(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function metricValue(point: ChartPointDto, metric: ChartMetric): number {
  return metric === "volume" ? Number(point.volumeUsd) : point.txCount;
}

export function chartSeriesIsEmpty(points: ChartPointDto[], metric: ChartMetric): boolean {
  return points.every((point) => metricValue(point, metric) === 0);
}

function seriesData(points: ChartPointDto[], metric: ChartMetric) {
  return points.map((point) => ({
    time: point.bucketStart as UTCTimestamp,
    value: metricValue(point, metric),
  }));
}

function smallestBucketGap(points: ChartPointDto[]): number {
  return points
    .map((point) => point.bucketStart)
    .reduce<{ previous: number | null; smallest: number }>(
      (scan, bucketStart) => ({
        previous: bucketStart,
        smallest:
          scan.previous === null || bucketStart <= scan.previous
            ? scan.smallest
            : Math.min(scan.smallest, bucketStart - scan.previous),
      }),
      { previous: null, smallest: Number.POSITIVE_INFINITY },
    ).smallest;
}

export function resolveBucketSpan(points: ChartPointDto[]): BucketSpan {
  return smallestBucketGap(points) < DAY_SECONDS ? "hour" : "day";
}

export function formatBucketMoment(
  bucketStart: number,
  span: BucketSpan,
  timeZone: string = viewerTimeZone(),
): string {
  const moment = new Date(bucketStart * 1000);
  if (span === "hour") return hourlyMomentFormat(timeZone).format(moment);
  return DAILY_MOMENT_FORMAT.format(moment);
}

const tickDateFormat = zoneFormatFamily({ month: "short", day: "numeric" });

const tickMonthFormat = zoneFormatFamily({ month: "short" });

const tickYearFormat = zoneFormatFamily({ year: "numeric" });

function tickZoneFor(span: BucketSpan, viewerZone: string): string {
  return span === "hour" ? viewerZone : "UTC";
}

export function formatTickMark(
  bucketStart: number,
  span: BucketSpan,
  tickMarkType: TickMarkType,
  timeZone: string = viewerTimeZone(),
): string {
  const zone = tickZoneFor(span, timeZone);
  const moment = new Date(bucketStart * 1000);
  if (tickMarkType === TickMarkType.Year) return tickYearFormat(zone).format(moment);
  if (tickMarkType === TickMarkType.Month) return tickMonthFormat(zone).format(moment);
  if (tickMarkType === TickMarkType.DayOfMonth) return tickDateFormat(zone).format(moment);
  return hourlyTickFormat(zone).format(moment);
}

type ChartTimeScaleOptions = Pick<
  TimeScaleOptions,
  "timeVisible" | "secondsVisible" | "tickMarkFormatter"
>;

export function timeScaleOptionsFor(
  span: BucketSpan,
  timeZone: string = viewerTimeZone(),
): ChartTimeScaleOptions {
  return {
    timeVisible: span === "hour",
    secondsVisible: false,
    tickMarkFormatter: (time: Time, tickMarkType: TickMarkType) =>
      typeof time === "number" ? formatTickMark(time, span, tickMarkType, timeZone) : null,
  };
}

export function crosshairTimeFormatter(
  span: BucketSpan,
  timeZone: string = viewerTimeZone(),
): (time: Time) => string {
  return (time) => (typeof time === "number" ? formatBucketMoment(time, span, timeZone) : "");
}

export function priceScaleModeFor(scale: ChartScale): PriceScaleMode {
  return scale === "log" ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal;
}

const PRICE_SCALE_MARGINS = { top: 0.1, bottom: 0.1 };

export function priceScaleOptionsFor(scale: ChartScale): DeepPartial<PriceScaleOptions> {
  return {
    mode: priceScaleModeFor(scale),
    scaleMargins: PRICE_SCALE_MARGINS,
    entireTextOnly: true,
  };
}

export function formatBucketValue(point: ChartPointDto, metric: ChartMetric): string {
  if (metric === "volume") return `$${formatUsdAmount(point.volumeUsd)}`;
  return point.txCount.toLocaleString("en");
}

export type TooltipBox = { width: number; height: number };

export type TooltipPoint = { x: number; y: number };

function clamp(value: number, lowest: number, highest: number): number {
  return Math.min(Math.max(value, lowest), Math.max(lowest, highest));
}

export function tooltipPosition(
  cursor: TooltipPoint,
  tooltip: TooltipBox,
  frame: TooltipBox,
): TooltipPoint {
  const rightOfCursor = cursor.x + TOOLTIP_CURSOR_GAP;
  const fitsRight = rightOfCursor + tooltip.width <= frame.width;
  const x = fitsRight ? rightOfCursor : cursor.x - TOOLTIP_CURSOR_GAP - tooltip.width;
  const aboveCursor = cursor.y - TOOLTIP_CURSOR_GAP - tooltip.height;
  const y = aboveCursor >= 0 ? aboveCursor : cursor.y + TOOLTIP_CURSOR_GAP;
  return {
    x: clamp(x, 0, frame.width - tooltip.width),
    y: clamp(y, 0, frame.height - tooltip.height),
  };
}

type MonotoneAreaPartialOptions = SeriesPartialOptions<MonotoneAreaSeriesOptions>;

const AXIS_VOLUME_FORMAT = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 2,
});

function priceFormatFor(metric: ChartMetric): MonotoneAreaPartialOptions["priceFormat"] {
  if (metric === "volume") {
    return { type: "custom", formatter: (value: number) => AXIS_VOLUME_FORMAT.format(value) };
  }
  return { type: "custom", formatter: (value: number) => Math.round(value).toLocaleString("en-US") };
}

function themedChartOptions(palette: ChartPalette): DeepPartial<ChartOptions> {
  return {
    layout: { textColor: palette.textColor },
    grid: {
      vertLines: { visible: false },
      horzLines: { color: palette.gridColor, style: LineStyle.Dotted },
    },
    rightPriceScale: { borderVisible: false },
    timeScale: { borderVisible: false },
    crosshair: {
      vertLine: {
        color: palette.crosshairColor,
        style: LineStyle.Dashed,
        labelBackgroundColor: palette.labelBackground,
      },
      horzLine: {
        color: palette.crosshairColor,
        style: LineStyle.Dashed,
        labelBackgroundColor: palette.labelBackground,
      },
    },
  };
}

export function baseSeriesOptions(): MonotoneAreaPartialOptions {
  return {
    lineWidth: LINE_WIDTH,
    priceLineVisible: true,
    priceLineStyle: LineStyle.Dashed,
  };
}

function themedSeriesOptions(palette: ChartPalette): MonotoneAreaPartialOptions {
  return {
    lineColor: palette.lineColor,
    topColor: palette.topColor,
    bottomColor: palette.bottomColor,
    priceLineColor: palette.lineColor,
  };
}

function activePalette(): ChartPalette {
  return chartPalette(resolveTheme(document.documentElement.dataset.theme ?? null));
}

type ChartView = {
  metric: ChartMetric;
  bucketSpan: BucketSpan;
  pointsByBucketStart: Map<number, ChartPointDto>;
  newest: { time: UTCTimestamp; value: number } | null;
};

function chartView(points: ChartPointDto[], metric: ChartMetric): ChartView {
  return {
    metric,
    bucketSpan: resolveBucketSpan(points),
    pointsByBucketStart: new Map(points.map((point) => [point.bucketStart, point])),
    newest: seriesData(points, metric).at(-1) ?? null,
  };
}

function hoveredPoint(view: ChartView, time: Time | undefined): ChartPointDto | undefined {
  if (typeof time !== "number") return undefined;
  return view.pointsByBucketStart.get(time);
}

export function VolumeChart({
  points,
  metric,
  scale,
}: {
  points: ChartPointDto[];
  metric: ChartMetric;
  scale: ChartScale;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipMomentRef = useRef<HTMLSpanElement>(null);
  const tooltipValueRef = useRef<HTMLSpanElement>(null);
  const liveDotRef = useRef<HTMLSpanElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<
    "Custom",
    Time,
    MonotoneAreaData | WhitespaceData<Time>,
    MonotoneAreaSeriesOptions
  > | null>(null);
  const viewRef = useRef<ChartView | null>(null);
  const liveDotFrameRef = useRef<number | null>(null);

  const placeLiveDot = useCallback(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const dot = liveDotRef.current;
    if (chart === null || series === null || dot === null) return;
    const newest = viewRef.current?.newest ?? null;
    if (newest === null) {
      dot.dataset.visible = "false";
      return;
    }
    const x = chart.timeScale().timeToCoordinate(newest.time);
    const y = series.priceToCoordinate(newest.value);
    const pane = chart.paneSize();
    const outsidePane =
      x === null || y === null || x < 0 || x > pane.width || y < 0 || y > pane.height;
    if (outsidePane) {
      dot.dataset.visible = "false";
      return;
    }
    dot.style.setProperty("--dot-x", `${x}px`);
    dot.style.setProperty("--dot-y", `${y}px`);
    dot.dataset.visible = "true";
  }, []);

  const scheduleLiveDot = useCallback(() => {
    if (liveDotFrameRef.current !== null) return;
    liveDotFrameRef.current = requestAnimationFrame(() => {
      liveDotFrameRef.current = null;
      placeLiveDot();
    });
  }, [placeLiveDot]);

  const trackCrosshair = useCallback((crosshair: MouseEventParams) => {
    const tooltip = tooltipRef.current;
    const frame = frameRef.current;
    const moment = tooltipMomentRef.current;
    const value = tooltipValueRef.current;
    const view = viewRef.current;
    if (tooltip === null || frame === null || moment === null || value === null || view === null) {
      return;
    }
    const hovered = hoveredPoint(view, crosshair.time);
    if (crosshair.point === undefined || hovered === undefined) {
      tooltip.dataset.visible = "false";
      return;
    }
    moment.textContent = formatBucketMoment(hovered.bucketStart, view.bucketSpan);
    value.textContent = formatBucketValue(hovered, view.metric);
    tooltip.dataset.visible = "true";
    const position = tooltipPosition(
      crosshair.point,
      { width: tooltip.offsetWidth, height: tooltip.offsetHeight },
      { width: frame.clientWidth, height: frame.clientHeight },
    );
    tooltip.style.setProperty("--tip-x", `${position.x}px`);
    tooltip.style.setProperty("--tip-y", `${position.y}px`);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        fontFamily: CHART_FONT_FAMILY,
        attributionLogo: false,
      },
      localization: { locale: "en-US" },
      handleScale: { axisPressedMouseMove: { price: false } },
    });
    const series = chart.addCustomSeries(new MonotoneAreaSeries(), baseSeriesOptions());
    chartRef.current = chart;
    seriesRef.current = series;

    const repaintForTheme = () => {
      const palette = activePalette();
      chart.applyOptions(themedChartOptions(palette));
      series.applyOptions(themedSeriesOptions(palette));
    };
    repaintForTheme();

    const themeObserver = new MutationObserver(repaintForTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    const paneObserver = new ResizeObserver(scheduleLiveDot);
    paneObserver.observe(container);

    chart.subscribeCrosshairMove(trackCrosshair);
    chart.timeScale().subscribeVisibleTimeRangeChange(scheduleLiveDot);

    return () => {
      const pendingFrame = liveDotFrameRef.current;
      if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
      liveDotFrameRef.current = null;
      chart.timeScale().unsubscribeVisibleTimeRangeChange(scheduleLiveDot);
      chart.unsubscribeCrosshairMove(trackCrosshair);
      paneObserver.disconnect();
      themeObserver.disconnect();
      chartRef.current = null;
      seriesRef.current = null;
      chart.remove();
    };
  }, [scheduleLiveDot, trackCrosshair]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const tooltip = tooltipRef.current;
    if (chart === null || series === null) return;
    if (tooltip !== null) tooltip.dataset.visible = "false";
    const view = chartView(points, metric);
    viewRef.current = view;
    chart.applyOptions({
      timeScale: timeScaleOptionsFor(view.bucketSpan),
      localization: { timeFormatter: crosshairTimeFormatter(view.bucketSpan) },
    });
    series.applyOptions({ priceFormat: priceFormatFor(metric) });
    series.setData(seriesData(points, metric));
    chart.timeScale().fitContent();
    scheduleLiveDot();
  }, [points, metric, scheduleLiveDot]);

  useEffect(() => {
    const chart = chartRef.current;
    if (chart === null) return;
    chart.applyOptions({ rightPriceScale: priceScaleOptionsFor(scale) });
    scheduleLiveDot();
  }, [scale, scheduleLiveDot]);

  return (
    <div ref={frameRef} className="chart-frame">
      <div ref={containerRef} className="chart-glow h-80 w-full" />
      <span
        ref={liveDotRef}
        className="chart-live-dot"
        data-visible="false"
        aria-hidden="true"
      />
      <div ref={tooltipRef} className="chart-tooltip" data-visible="false" aria-hidden="true">
        <span ref={tooltipMomentRef} className="chart-tooltip-moment" />
        <span ref={tooltipValueRef} className="chart-tooltip-value" />
      </div>
    </div>
  );
}
