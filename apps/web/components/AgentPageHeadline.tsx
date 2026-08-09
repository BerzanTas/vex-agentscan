import type { AgentPageDto } from "../lib/api";
import { formatUsdCompact, formatUsdEstimate } from "../lib/format";
import { AgentPageStatCard } from "./AgentPageStatCard";

const CADENCE_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function AgentPageHeadline({ agent }: { agent: AgentPageDto }) {
  return (
    <section className="section-enter grid grid-cols-1 gap-4 sm:grid-cols-2">
      <AgentPageStatCard
        label="Capital deployed"
        window="PEAK 30D"
        value={`$${formatUsdCompact(agent.capitalDeployedPeak30dUsd)}`}
        exactValue={`$${formatUsdEstimate(agent.capitalDeployedPeak30dUsd)}`}
        unit="est."
        note="deployed through agent activity"
      />
      <AgentPageStatCard
        label="Activity cadence"
        window="30D"
        value={CADENCE_FORMAT.format(agent.activitiesPerDay30d)}
        unit="/ day"
      />
    </section>
  );
}
