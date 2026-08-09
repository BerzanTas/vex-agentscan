"use client";

import type { AgentDailyDeployedDto, ChartPointDto } from "../lib/api";
import { EmptyPanel } from "./EmptyPanel";
import { PanelHeading } from "./PanelHeading";
import { chartSeriesIsEmpty, VolumeChart } from "./VolumeChart";

const MILLISECONDS_PER_SECOND = 1000;

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
      <PanelHeading title="Daily capital deployed" meta="30D · USD est." />
      {chartSeriesIsEmpty(points, "volume") ? (
        <EmptyPanel message="No priced capital deployed in the last 30 days" withLiveDot={false} />
      ) : (
        <VolumeChart points={points} metric="volume" scale="linear" />
      )}
    </section>
  );
}
