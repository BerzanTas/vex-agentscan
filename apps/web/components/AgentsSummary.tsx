import type { ChartRange } from "../lib/api";
import { AgentPageStatCard } from "./AgentPageStatCard";

const RANGE_WINDOW: Record<ChartRange, string> = {
  "24h": "24H",
  "7d": "7D",
  "30d": "30D",
  all: "ALL",
};

function countLabel(count: number): string {
  return count.toLocaleString("en-US");
}

export function AgentsSummary({
  totalAllTime,
  totalInWindow,
  range,
}: {
  totalAllTime: number;
  totalInWindow: number;
  range: ChartRange;
}) {
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <AgentPageStatCard label="Agents" window="ALL" value={countLabel(totalAllTime)} />
      <AgentPageStatCard
        label="In this window"
        window={RANGE_WINDOW[range]}
        value={countLabel(totalInWindow)}
      />
    </section>
  );
}
