import type { StatsDto } from "../lib/api";
import { formatUsdEstimate } from "../lib/format";

type StatCard = { label: string; value: string; estimate: boolean };

function cardsFrom(stats: StatsDto): StatCard[] {
  return [
    { label: "Volume (24h)", value: `$${formatUsdEstimate(stats.dailyVolumeUsd)}`, estimate: true },
    { label: "Total volume", value: `$${formatUsdEstimate(stats.totalVolumeUsd)}`, estimate: true },
    { label: "Transactions (24h)", value: stats.dailyTx.toLocaleString("en-US"), estimate: false },
    { label: "Total transactions", value: stats.totalTx.toLocaleString("en-US"), estimate: false },
    { label: "Active agents (7d)", value: stats.activeAgents7d.toLocaleString("en-US"), estimate: false },
  ];
}

export function StatCards({ stats }: { stats: StatsDto }) {
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {cardsFrom(stats).map((card) => (
        <div key={card.label} className="rounded-lg border border-bg-overlay bg-bg-elevated p-4">
          <p className="text-xs text-text-muted">{card.label}</p>
          <p className="mt-2 font-mono text-xl text-text-primary">
            {card.value}
            {card.estimate && <span className="ml-1 text-xs text-text-muted">est.</span>}
          </p>
        </div>
      ))}
    </section>
  );
}
