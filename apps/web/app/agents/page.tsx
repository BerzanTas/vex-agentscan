import type { Metadata } from "next";
import { parseChartRange } from "../../lib/range";
import { AgentsRankingTable } from "../../components/AgentsRankingTable";
import { PageHeading } from "../../components/PageHeading";
import { PricingCoverageNote } from "../../components/PricingCoverageNote";
import { RangeChips } from "../../components/RangeChips";
import { fetchAgents, fetchPricingCoverage } from "../../lib/api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Top agents - AgentScan",
  description: "Vex agents ranked by the volume observed in their verified activity",
};

type AgentsPageProps = { searchParams: Promise<{ range?: string | string[] }> };

export default async function AgentsPage({ searchParams }: AgentsPageProps) {
  const range = parseChartRange((await searchParams).range);
  const [agents, coverage] = await Promise.all([fetchAgents(range), fetchPricingCoverage(range)]);

  return (
    <section className="section-enter flex flex-col gap-6">
      <PageHeading
        kicker="RANKING // AGENTS"
        title="Top agents"
        actions={<RangeChips current={range} label="Agent ranking range" />}
      />
      <AgentsRankingTable agents={agents} emptyMessage="No verified agent activity yet" />
      <PricingCoverageNote coverage={coverage} />
    </section>
  );
}
