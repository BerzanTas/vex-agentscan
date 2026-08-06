"use client";

import {
  AreaSeries,
  ColorType,
  createChart,
  type AreaSeriesPartialOptions,
  type DeepPartial,
  type ChartOptions,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useCallback, useEffect, useRef } from "react";
import type { ChartPointDto } from "../lib/api";
import { chartPalette, type ChartPalette } from "../lib/chart-theme";
import { formatUsdEstimate } from "../lib/format";
import { resolveTheme } from "../lib/theme";

export type ChartMetric = "volume" | "txns";

export type BucketSpan = "hour" | "day";

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

const HOURLY_MOMENT_FORMAT = new Intl.DateTimeFormat("en", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZoneName: "short",
});

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

export function formatBucketMoment(bucketStart: number, span: BucketSpan): string {
  const moment = new Date(bucketStart * 1000);
  if (span === "hour") return HOURLY_MOMENT_FORMAT.format(moment);
  return DAILY_MOMENT_FORMAT.format(moment);
}

export function formatBucketValue(point: ChartPointDto, metric: ChartMetric): string {
  if (metric === "volume") return `$${formatUsdEstimate(point.volumeUsd)} est.`;
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

function priceFormatFor(metric: ChartMetric): AreaSeriesPartialOptions["priceFormat"] {
  if (metric === "volume") return { type: "volume" };
  return { type: "custom", formatter: (value: number) => Math.round(value).toLocaleString("en-US") };
}

function themedChartOptions(palette: ChartPalette): DeepPartial<ChartOptions> {
  return {
    layout: { textColor: palette.textColor },
    grid: {
      vertLines: { color: palette.gridColor },
      horzLines: { color: palette.gridColor },
    },
    rightPriceScale: { borderColor: palette.gridColor },
    timeScale: { borderColor: palette.gridColor },
  };
}

function themedSeriesOptions(palette: ChartPalette): AreaSeriesPartialOptions {
  return {
    lineColor: palette.lineColor,
    topColor: palette.topColor,
    bottomColor: palette.bottomColor,
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

export function VolumeChart({ points, metric }: { points: ChartPointDto[]; metric: ChartMetric }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipMomentRef = useRef<HTMLSpanElement>(null);
  const tooltipValueRef = useRef<HTMLSpanElement>(null);
  const liveDotRef = useRef<HTMLSpanElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
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
    const series = chart.addSeries(AreaSeries, { lineWidth: LINE_WIDTH });
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
    viewRef.current = chartView(points, metric);
    series.applyOptions({ priceFormat: priceFormatFor(metric) });
    series.setData(seriesData(points, metric));
    chart.timeScale().fitContent();
    scheduleLiveDot();
  }, [points, metric, scheduleLiveDot]);

  return (
    <div ref={frameRef} className="chart-frame">
      <div ref={containerRef} className="h-80 w-full" />
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
