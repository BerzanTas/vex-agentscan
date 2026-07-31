"use client";

import { AreaSeries, ColorType, createChart } from "lightweight-charts";
import { useEffect, useRef } from "react";
import type { ChartPointDto } from "../lib/api";

export function VolumeChart({ points }: { points: ChartPointDto[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null || points.length === 0) return;
    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#939aad",
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "#171e38" },
        horzLines: { color: "#171e38" },
      },
      rightPriceScale: { borderColor: "#171e38" },
      timeScale: { borderColor: "#171e38" },
      localization: { locale: "en-US" },
    });
    const series = chart.addSeries(AreaSeries, {
      lineColor: "#1f44ff",
      lineWidth: 2,
      topColor: "rgba(31, 68, 255, 0.35)",
      bottomColor: "rgba(31, 68, 255, 0.02)",
      priceFormat: { type: "volume" },
    });
    series.setData(points.map((point) => ({ time: point.day, value: Number(point.volumeUsd) })));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [points]);

  if (points.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center text-sm text-text-muted">
        No volume data yet
      </div>
    );
  }

  return <div ref={containerRef} className="h-80 w-full" />;
}
