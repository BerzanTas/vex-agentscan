"use client";

import type { AgentDailyDeployedDto, ChartPointDto } from "../lib/api";
import { EmptyPanel } from "./EmptyPanel";
import { PanelHeading } from "./PanelHeading";
import { chartSeriesIsEmpty, VolumeChart } from "./VolumeChart";

const MILLISECONDS_PER_SECOND = 1000;

const NO_DAY_REACHED_A_CENT = "No day in the last 30 reached $0.01 of priced capital deployed";

export function deployedChartPoints(days: AgentDailyDeployedDto[]): ChartPointDto[] {
  return days.map((entry) => ({
    bucketStart: Date.parse(`${entry.day}T00:00:00Z`) / MILLISECONDS_PER_SECOND,
    volumeUsd: entry.usd,
    txCount: 0,
  }));
}

export function AgentPageDeployedChart({ days }: { days: AgentDailyDeployedDto[] }) {
  const points = deployedChartPoints(days);
  return (
    <section className="section-enter glass p-4">
      <PanelHeading title="Daily capital deployed" meta="30D · USD" />
      {chartSeriesIsEmpty(points, "volume") ? (
        <EmptyPanel message={NO_DAY_REACHED_A_CENT} withLiveDot={false} />
      ) : (
        <VolumeChart points={points} metric="volume" scale="linear" />
      )}
    </section>
  );
}
