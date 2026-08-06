import type { StatsDto } from "../lib/api";
import { formatUsdCompact, formatUsdEstimate } from "../lib/format";
import { CountUpValue, type CountUpKind } from "./CountUpValue";
import { CursorLight } from "./CursorLight";

type StatCard = {
  label: string;
  window?: string;
  target: number;
  finalText: string;
  exactText: string;
  kind: CountUpKind;
  unit?: string;
};

function usdCard(label: string, usdEstimate: string): StatCard {
  return {
    label,
    target: Number(usdEstimate),
    finalText: `$${formatUsdCompact(usdEstimate)}`,
    exactText: `$${formatUsdEstimate(usdEstimate)}`,
    kind: "usdCompact",
    unit: "est.",
  };
}

function countCard(label: string, count: number, window?: string): StatCard {
  return {
    label,
    window,
    target: count,
    finalText: count.toLocaleString("en-US"),
    exactText: count.toLocaleString("en-US"),
    kind: "count",
  };
}

function cardsFrom(stats: StatsDto): StatCard[] {
  return [
    usdCard("Daily volume", stats.dailyVolumeUsd),
    usdCard("Total volume", stats.totalVolumeUsd),
    countCard("Daily txns", stats.dailyTx),
    countCard("Total txns", stats.totalTx),
    countCard("Active agents", stats.activeAgents7d, "7D"),
  ];
}

export function StatCards({ stats }: { stats: StatsDto }) {
  return (
    <section className="section-enter grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {cardsFrom(stats).map((card) => (
        <CursorLight key={card.label} className="stat-card">
          <div className="stat-card-head">
            <span className="stat-card-label">{card.label}</span>
            {card.window !== undefined && <span className="stat-card-window">{card.window}</span>}
          </div>
          <p className="stat-card-value" title={card.exactText}>
            <CountUpValue target={card.target} finalText={card.finalText} kind={card.kind} />
            {card.unit !== undefined && <span className="stat-card-unit">{card.unit}</span>}
          </p>
        </CursorLight>
      ))}
    </section>
  );
}
