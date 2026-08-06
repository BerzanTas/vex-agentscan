import Link from "next/link";
import { ActivityTable } from "../components/ActivityTable";
import { AgentRanking } from "../components/AgentRanking";
import { AutoRefresh } from "../components/AutoRefresh";
import { ChartPanel } from "../components/ChartPanel";
import { Hero } from "../components/Hero";
import { PanelHeading } from "../components/PanelHeading";
import { ProtocolRanking } from "../components/ProtocolRanking";
import { StatCards } from "../components/StatCards";
import {
  DEFAULT_CHART_RANGE,
  fetchActivity,
  fetchAgents,
  fetchChart,
  fetchProtocols,
  fetchStats,
} from "../lib/api";

export const dynamic = "force-dynamic";
export const fetchCache = "default-cache";

const AGENT_RANKING_DAYS = 30;
const LATEST_ACTIVITY_ROWS = 10;

export default async function DashboardPage() {
  const [stats, chart, protocols, agents, activity] = await Promise.all([
    fetchStats(),
    fetchChart(DEFAULT_CHART_RANGE),
    fetchProtocols("all"),
    fetchAgents(),
    fetchActivity(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <AutoRefresh />
      <Hero />
      <StatCards stats={stats} />
      <ChartPanel initialPoints={chart} initialRange={DEFAULT_CHART_RANGE} />
      <div className="section-enter grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
        <section className="glass p-4">
          <PanelHeading title="Protocols" meta="all time" />
          <ProtocolRanking protocols={protocols} />
        </section>
        <section className="glass p-4">
          <PanelHeading title="Agents" meta={`${AGENT_RANKING_DAYS}d`} />
          <AgentRanking agents={agents} />
        </section>
      </div>
      <section className="section-enter">
        <PanelHeading title="Latest activity" />
        <ActivityTable
          rows={activity.items.slice(0, LATEST_ACTIVITY_ROWS)}
          emptyMessage="Waiting for the first verified activity"
        />
        <Link href="/activity" className="feed-more">
          View all activity →
        </Link>
      </section>
    </div>
  );
}
