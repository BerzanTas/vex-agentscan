import { ActivityTable } from "../components/ActivityTable";
import { AgentRanking } from "../components/AgentRanking";
import { AutoRefresh } from "../components/AutoRefresh";
import { Hero } from "../components/Hero";
import { PanelHeading } from "../components/PanelHeading";
import { ProtocolRanking } from "../components/ProtocolRanking";
import { StatCards } from "../components/StatCards";
import { VolumeChart } from "../components/VolumeChart";
import { fetchActivity, fetchAgents, fetchChart, fetchProtocols, fetchStats } from "../lib/api";

export const dynamic = "force-dynamic";
export const fetchCache = "default-cache";

const CHART_DAYS = 30;
const AGENT_RANKING_DAYS = 30;

export default async function DashboardPage() {
  const [stats, chart, protocols, agents, activity] = await Promise.all([
    fetchStats(),
    fetchChart(CHART_DAYS),
    fetchProtocols(),
    fetchAgents(),
    fetchActivity(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <AutoRefresh />
      <Hero />
      <StatCards stats={stats} />
      <section className="section-enter card card-hover p-4">
        <PanelHeading title="Volume" meta={`${CHART_DAYS}d · USD est.`} />
        <VolumeChart points={chart} />
      </section>
      <div className="section-enter grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section className="card card-hover p-4">
          <PanelHeading title="Protocols" meta="all time" />
          <ProtocolRanking protocols={protocols} />
        </section>
        <section className="card card-hover p-4">
          <PanelHeading title="Agents" meta={`${AGENT_RANKING_DAYS}d`} />
          <AgentRanking agents={agents} />
        </section>
      </div>
      <section className="section-enter">
        <PanelHeading title="Latest activity" />
        <ActivityTable rows={activity.items} />
      </section>
    </div>
  );
}
