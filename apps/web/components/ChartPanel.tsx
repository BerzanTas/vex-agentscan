"use client";

import { useState } from "react";
import { fetchChartFromBrowser, type ChartPointDto, type ChartRange } from "../lib/api";
import { EmptyPanel } from "./EmptyPanel";
import {
  VolumeChart,
  chartSeriesIsEmpty,
  type ChartMetric,
  type ChartScale,
} from "./VolumeChart";

const RANGE_CHIPS: { range: ChartRange; label: string }[] = [
  { range: "24h", label: "24H" },
  { range: "7d", label: "7D" },
  { range: "30d", label: "30D" },
  { range: "all", label: "ALL" },
];

const METRIC_CHIPS: { metric: ChartMetric; label: string }[] = [
  { metric: "volume", label: "VOL" },
  { metric: "txns", label: "TXNS" },
];

const SCALE_CHIPS: { scale: ChartScale; label: string }[] = [
  { scale: "linear", label: "LIN" },
  { scale: "log", label: "LOG" },
];

function chipClass(active: boolean): string {
  return active ? "chart-chip chart-chip-active" : "chart-chip";
}

export function ChartPanel({
  initialPoints,
  initialRange,
}: {
  initialPoints: ChartPointDto[];
  initialRange: ChartRange;
}) {
  const [range, setRange] = useState<ChartRange>(initialRange);
  const [metric, setMetric] = useState<ChartMetric>("volume");
  const [scale, setScale] = useState<ChartScale>("linear");
  const [points, setPoints] = useState<ChartPointDto[]>(initialPoints);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const showRange = async (next: ChartRange) => {
    if (next === range || loading) return;
    setRange(next);
    setLoading(true);
    setLoadFailed(false);
    try {
      setPoints(await fetchChartFromBrowser(next));
    } catch (error) {
      console.error(error);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="section-enter glass p-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-sm text-text-secondary">Volume</h2>
        {metric === "volume" && (
          <span className="font-mono text-xs tracking-wide text-text-muted">USD</span>
        )}
        {loading && (
          <span className="font-mono text-xs tracking-wide text-text-muted">Loading…</span>
        )}
        <div className="panel-actions">
          <div className="chart-chip-group" role="group" aria-label="Chart range">
            {RANGE_CHIPS.map((chip) => (
              <button
                key={chip.range}
                type="button"
                className={chipClass(chip.range === range)}
                aria-pressed={chip.range === range}
                onClick={() => void showRange(chip.range)}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <span className="chart-chip-separator" aria-hidden="true" />
          <div className="chart-chip-group" role="group" aria-label="Chart metric">
            {METRIC_CHIPS.map((chip) => (
              <button
                key={chip.metric}
                type="button"
                className={chipClass(chip.metric === metric)}
                aria-pressed={chip.metric === metric}
                onClick={() => setMetric(chip.metric)}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <span className="chart-chip-separator" aria-hidden="true" />
          <div className="chart-chip-group" role="group" aria-label="Chart scale">
            {SCALE_CHIPS.map((chip) => (
              <button
                key={chip.scale}
                type="button"
                className={chipClass(chip.scale === scale)}
                aria-pressed={chip.scale === scale}
                onClick={() => setScale(chip.scale)}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {chartSeriesIsEmpty(points, metric) ? (
        <EmptyPanel message="No volume in this range" withLiveDot={false} />
      ) : (
        <VolumeChart points={points} metric={metric} scale={scale} />
      )}
      {loadFailed && (
        <p role="status" className="mt-4 text-center text-sm text-warning">
          Could not load this range
        </p>
      )}
    </section>
  );
}
