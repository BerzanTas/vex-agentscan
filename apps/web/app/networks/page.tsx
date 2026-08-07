import type { Metadata } from "next";
import { parseChartRange } from "../../lib/range";
import { NetworksTable } from "../../components/NetworksTable";
import { PanelHeading } from "../../components/PanelHeading";
import { RangeChips } from "../../components/RangeChips";
import { RoutesList } from "../../components/RoutesList";
import {
  fetchBridgeRoutes,
  fetchNetworks,
} from "../../lib/api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Networks — AgentScan",
  description: "Every network AgentScan can verify, with the agent activity observed on it",
};

type NetworksPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function NetworksPage({ searchParams }: NetworksPageProps) {
  const range = parseChartRange((await searchParams).range);
  const [networks, routes] = await Promise.all([fetchNetworks(range), fetchBridgeRoutes(range)]);

  return (
    <div className="flex flex-col gap-8">
      <section className="section-enter flex flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl text-text-primary">Networks</h1>
            <p className="text-sm text-text-secondary">
              Every network in the AgentScan registry, including the ones with no activity yet.
            </p>
          </div>
          <RangeChips current={range} label="Network activity range" />
        </header>
        <NetworksTable networks={networks} />
      </section>
      <section className="section-enter glass p-4">
        <PanelHeading title="Bridge routes" meta={range} />
        <RoutesList routes={routes} emptyMessage="No bridge legs observed in this window" />
      </section>
    </div>
  );
}
