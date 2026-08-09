import type { AgentPageDto } from "../lib/api";
import { formatUsdCompact, formatUsdEstimate } from "../lib/format";
import { AgentPageStatCard } from "./AgentPageStatCard";
import { PanelHeading } from "./PanelHeading";

const PERCENT = 100;
const NO_VALUE = "—";

function signedUsd(usd: string, format: (usd: string) => string): string {
  const formatted = format(usd);
  if (formatted.startsWith("-")) return `-$${formatted.slice(1)}`;
  return `$${formatted}`;
}

function winRateValue(winRate: number | null): string {
  if (winRate === null) return NO_VALUE;
  return `${Math.floor(winRate * PERCENT)}%`;
}

function winRateNote(winRate: number | null): string | undefined {
  if (winRate === null) return "Not enough closed round trips yet";
  return undefined;
}

const UNMATCHED_PORTION_SENTENCE =
  "The unmatched portion contributes nothing to the realized result; the matched portion still closes a round trip.";

function unmatchedDisposalsNote(count: number): string {
  if (count === 1) {
    return `1 disposal consumed more than the priced inventory available. ${UNMATCHED_PORTION_SENTENCE}`;
  }
  return `${count.toLocaleString("en-US")} disposals consumed more than the priced inventory available. ${UNMATCHED_PORTION_SENTENCE}`;
}

export function AgentPagePerformance({ agent }: { agent: AgentPageDto }) {
  return (
    <section className="section-enter flex flex-col gap-4">
      <PanelHeading title="Performance" meta="PRICED ACTIVITY" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <AgentPageStatCard
          label="Realized result"
          value={signedUsd(agent.realizedResultUsd, formatUsdCompact)}
          exactValue={signedUsd(agent.realizedResultUsd, formatUsdEstimate)}
          unit="est."
        />
        <AgentPageStatCard
          label="Closed round trips"
          value={agent.closedRoundTrips.toLocaleString("en-US")}
        />
        <AgentPageStatCard
          label="Win rate"
          value={winRateValue(agent.winRate)}
          note={winRateNote(agent.winRate)}
        />
      </div>
      {agent.unmatchedDisposals > 0 && (
        <p className="max-w-3xl text-xs text-text-muted">
          {unmatchedDisposalsNote(agent.unmatchedDisposals)}
        </p>
      )}
    </section>
  );
}
