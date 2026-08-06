import type { StatsDto } from "../lib/api";
import { formatUsdEstimate } from "../lib/format";
import { CountUpValue, type CountUpKind } from "./CountUpValue";
import { CursorLight } from "./CursorLight";

type StatCard = {
  label: string;
  target: number;
  finalText: string;
  kind: CountUpKind;
  estimate: boolean;
};

function usdCard(label: string, usdEstimate: string): StatCard {
  return {
    label,
    target: Number(usdEstimate),
    finalText: `$${formatUsdEstimate(usdEstimate)}`,
    kind: "usd",
    estimate: true,
  };
}

function countCard(label: string, count: number): StatCard {
  return {
    label,
    target: count,
    finalText: count.toLocaleString("en-US"),
    kind: "count",
    estimate: false,
  };
}

function cardsFrom(stats: StatsDto): StatCard[] {
  return [
    usdCard("Daily volume", stats.dailyVolumeUsd),
    usdCard("Total volume", stats.totalVolumeUsd),
    countCard("Daily txns", stats.dailyTx),
    countCard("Total txns", stats.totalTx),
    countCard("Active agents (7d)", stats.activeAgents7d),
  ];
}

export function StatCards({ stats }: { stats: StatsDto }) {
  return (
    <section className="section-enter grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {cardsFrom(stats).map((card) => (
        <CursorLight key={card.label} className="p-4">
          <p className="text-xs text-text-muted">{card.label}</p>
          <p className="mt-2 font-mono text-xl text-text-primary">
            <CountUpValue target={card.target} finalText={card.finalText} kind={card.kind} />
            {card.estimate && <span className="ml-1 text-xs text-text-muted">est.</span>}
          </p>
        </CursorLight>
      ))}
    </section>
  );
}
