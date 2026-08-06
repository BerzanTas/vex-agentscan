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
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import type { ChartPointDto } from "../lib/api";
import { chartPalette, type ChartPalette } from "../lib/chart-theme";
import { resolveTheme } from "../lib/theme";

export type ChartMetric = "volume" | "txns";

const CHART_FONT_FAMILY = "JetBrains Mono, ui-monospace, monospace";
const LINE_WIDTH = 2;

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

export function VolumeChart({ points, metric }: { points: ChartPointDto[]; metric: ChartMetric }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

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

    return () => {
      themeObserver.disconnect();
      chartRef.current = null;
      seriesRef.current = null;
      chart.remove();
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (chart === null || series === null) return;
    series.applyOptions({ priceFormat: priceFormatFor(metric) });
    series.setData(seriesData(points, metric));
    chart.timeScale().fitContent();
  }, [points, metric]);

  return <div ref={containerRef} className="h-80 w-full" />;
}
