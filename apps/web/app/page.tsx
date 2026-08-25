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
const HOMEPAGE_RANKING_ROWS = 5;
const LATEST_ACTIVITY_ROWS = 10;

export default async function DashboardPage() {
  const [stats, chart, protocols, agents, activity] = await Promise.all([
    fetchStats(),
    fetchChart(DEFAULT_CHART_RANGE),
    fetchProtocols(),
    fetchAgents(DEFAULT_CHART_RANGE, { limit: HOMEPAGE_RANKING_ROWS }),
    fetchActivity(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <AutoRefresh />
      <Hero />
      <StatCards stats={stats} series={chart} />
      <ChartPanel initialPoints={chart} initialRange={DEFAULT_CHART_RANGE} />
      <div className="section-enter grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
        <section className="glass flex flex-col gap-4 p-4">
          <PanelHeading title="Protocols" meta="all time" />
          <ProtocolRanking protocols={protocols.slice(0, HOMEPAGE_RANKING_ROWS)} />
          <Link href="/protocols" className="feed-more">
            View all protocols →
          </Link>
        </section>
        <section className="glass flex flex-col gap-4 p-4">
          <PanelHeading title="Agents" meta={`${AGENT_RANKING_DAYS}d`} />
          <AgentRanking agents={agents.items.slice(0, HOMEPAGE_RANKING_ROWS)} />
          <Link href="/agents" className="feed-more">
            View all agents →
          </Link>
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
