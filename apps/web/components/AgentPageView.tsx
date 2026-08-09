import Link from "next/link";
import type { AgentPageDto } from "../lib/api";
import { AgentPageBreakdowns } from "./AgentPageBreakdowns";
import { AgentPageDeployedChart } from "./AgentPageDeployedChart";
import { AgentPageDisclosure } from "./AgentPageDisclosure";
import { AgentPageHeadline } from "./AgentPageHeadline";
import { AgentPagePerformance } from "./AgentPagePerformance";
import { PageHeading } from "./PageHeading";

const SECONDS_PER_HOUR = 3600;
const HOURS_PER_DAY = 24;
const WITHIN_THE_HOUR = "less than an hour";

function hourlyAge(ageSeconds: number): string {
  const hours = Math.floor(ageSeconds / SECONDS_PER_HOUR);
  if (hours < 1) return WITHIN_THE_HOUR;
  if (hours < HOURS_PER_DAY) return `${hours}h`;
  return `${Math.floor(hours / HOURS_PER_DAY)}d`;
}

function firstSeenLabel(agent: AgentPageDto): string {
  return `First seen ${hourlyAge(agent.firstSeenSeconds)} ago`;
}

function lastSeenLabel(agent: AgentPageDto): string {
  return `Last seen ${hourlyAge(agent.lastSeenSeconds)} ago`;
}

function activityCountLabel(agent: AgentPageDto): string {
  return `${agent.activityCount.toLocaleString("en-US")} verified activities`;
}

export function AgentPageView({ agent }: { agent: AgentPageDto }) {
  return (
    <div className="flex flex-col gap-8">
      <div className="section-enter flex flex-col gap-4">
        <Link href="/agents" className="text-sm text-text-secondary hover:text-text-primary">
          ← Agents
        </Link>
        <PageHeading kicker="AGENT // PROFILE" title={agent.name} />
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded bg-bg-overlay px-2 py-0.5 text-xs text-text-secondary">
            {firstSeenLabel(agent)}
          </span>
          <span className="rounded bg-bg-overlay px-2 py-0.5 text-xs text-text-secondary">
            {lastSeenLabel(agent)}
          </span>
          <span className="rounded bg-bg-overlay px-2 py-0.5 text-xs text-text-secondary">
            {activityCountLabel(agent)}
          </span>
        </div>
      </div>
      <AgentPageHeadline agent={agent} />
      <AgentPagePerformance agent={agent} />
      <AgentPageDeployedChart days={agent.dailyDeployedUsd} />
      <AgentPageBreakdowns protocols={agent.protocolBreakdown} chains={agent.chainBreakdown} />
      <AgentPageDisclosure
        unpricedSharePct={agent.unpricedSharePct}
        unpriced30dSharePct={agent.unpriced30dSharePct}
        truncated={agent.truncated}
      />
    </div>
  );
}
