import { ActivityTable } from "../components/ActivityTable";
import { AgentRanking } from "../components/AgentRanking";
import { AutoRefresh } from "../components/AutoRefresh";
import { Hero } from "../components/Hero";
import { ProtocolRanking } from "../components/ProtocolRanking";
import { StatCards } from "../components/StatCards";
import { VolumeChart } from "../components/VolumeChart";
import { fetchActivity, fetchAgents, fetchChart, fetchProtocols, fetchStats } from "../lib/api";

export const revalidate = 30;

const CHART_DAYS = 30;

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
        <h2 className="mb-4 text-sm text-text-secondary">Volume ({CHART_DAYS}d, USD est.)</h2>
        <VolumeChart points={chart} />
      </section>
      <div className="section-enter grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section className="card card-hover p-4">
          <h2 className="mb-4 text-sm text-text-secondary">Protocols</h2>
          <ProtocolRanking protocols={protocols} />
        </section>
        <section className="card card-hover p-4">
          <h2 className="mb-4 text-sm text-text-secondary">Agents (30d)</h2>
          <AgentRanking agents={agents} />
        </section>
      </div>
      <section className="section-enter">
        <h2 className="mb-4 text-sm text-text-secondary">Latest activity</h2>
        <ActivityTable rows={activity.items} />
      </section>
    </div>
  );
}
