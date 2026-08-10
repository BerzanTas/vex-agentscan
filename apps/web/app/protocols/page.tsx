import type { Metadata } from "next";
import { parseChartRange } from "../../lib/range";
import { PageHeading } from "../../components/PageHeading";
import { PricingCoverageNote } from "../../components/PricingCoverageNote";
import { ProtocolsRankingTable } from "../../components/ProtocolsRankingTable";
import { RangeChips } from "../../components/RangeChips";
import { fetchPricingCoverage, fetchProtocolRanking } from "../../lib/api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Protocols - AgentScan",
  description: "Protocols ranked by the volume observed in verified Vex agent activity",
};

type ProtocolsPageProps = { searchParams: Promise<{ range?: string | string[] }> };

export default async function ProtocolsPage({ searchParams }: ProtocolsPageProps) {
  const range = parseChartRange((await searchParams).range);
  const [protocols, coverage] = await Promise.all([
    fetchProtocolRanking(range),
    fetchPricingCoverage(range),
  ]);

  return (
    <section className="section-enter flex flex-col gap-6">
      <PageHeading
        kicker="RANKING // PROTOCOLS"
        title="Protocols"
        actions={<RangeChips current={range} label="Protocol ranking range" />}
      />
      <ProtocolsRankingTable protocols={protocols} emptyMessage="No verified activity yet" />
      <PricingCoverageNote coverage={coverage} scope="these-figures" />
    </section>
  );
}
