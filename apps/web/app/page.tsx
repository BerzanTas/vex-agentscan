import { ActivityTable } from "../components/ActivityTable";
import { AutoRefresh } from "../components/AutoRefresh";
import { ProtocolRanking } from "../components/ProtocolRanking";
import { StatCards } from "../components/StatCards";
import { VolumeChart } from "../components/VolumeChart";
import { fetchActivity, fetchChart, fetchProtocols, fetchStats } from "../lib/api";

export const revalidate = 30;

const CHART_DAYS = 30;

export default async function DashboardPage() {
  const [stats, chart, protocols, activity] = await Promise.all([
    fetchStats(),
    fetchChart(CHART_DAYS),
    fetchProtocols(),
    fetchActivity(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <AutoRefresh />
      <StatCards stats={stats} />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <section className="rounded-lg border border-bg-overlay bg-bg-elevated p-4 lg:col-span-2">
          <h2 className="mb-4 text-sm text-text-secondary">Volume ({CHART_DAYS}d, USD est.)</h2>
          <VolumeChart points={chart} />
        </section>
        <section>
          <h2 className="mb-4 text-sm text-text-secondary">Protocols</h2>
          <ProtocolRanking protocols={protocols} />
        </section>
      </div>
      <section>
        <h2 className="mb-4 text-sm text-text-secondary">Latest activity</h2>
        <ActivityTable rows={activity.items} />
      </section>
    </div>
  );
}
