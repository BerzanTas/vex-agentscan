import type { Metadata } from "next";
import { parseChartRange } from "../../lib/range";
import { NetworksTable } from "../../components/NetworksTable";
import { PageHeading } from "../../components/PageHeading";
import { PanelHeading } from "../../components/PanelHeading";
import { PricingCoverageNote } from "../../components/PricingCoverageNote";
import { RangeChips } from "../../components/RangeChips";
import { RoutesList } from "../../components/RoutesList";
import {
  fetchBridgeRoutes,
  fetchNetworks,
  fetchPricingCoverage,
} from "../../lib/api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Networks - AgentScan",
  description: "Every network AgentScan can verify, with the agent activity observed on it",
};

type NetworksPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function NetworksPage({ searchParams }: NetworksPageProps) {
  const range = parseChartRange((await searchParams).range);
  const [networks, routes, coverage] = await Promise.all([
    fetchNetworks(range),
    fetchBridgeRoutes(range),
    fetchPricingCoverage(range),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <section className="section-enter flex flex-col gap-6">
        <PageHeading
          kicker="REGISTRY // NETWORKS"
          title="Networks"
          description="Every network in the AgentScan registry, including the ones with no activity yet."
          actions={<RangeChips current={range} label="Network activity range" />}
        />
        <NetworksTable networks={networks} />
      </section>
      <section className="section-enter glass p-4">
        <PanelHeading title="Bridge routes" meta={range} />
        <RoutesList routes={routes} emptyMessage="No bridge legs observed in this window" />
      </section>
      <PricingCoverageNote coverage={coverage} scope="these-figures" />
    </div>
  );
}
