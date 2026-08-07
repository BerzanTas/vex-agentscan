import type { Metadata } from "next";
import { parseChartRange } from "../../lib/range";
import { AgentsRankingTable } from "../../components/AgentsRankingTable";
import { RangeChips } from "../../components/RangeChips";
import { fetchAgents } from "../../lib/api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Top agents — AgentScan",
  description: "Vex agents ranked by the volume observed in their verified activity",
};

type AgentsPageProps = { searchParams: Promise<{ range?: string | string[] }> };

export default async function AgentsPage({ searchParams }: AgentsPageProps) {
  const range = parseChartRange((await searchParams).range);
  const agents = await fetchAgents(range);

  return (
    <section className="section-enter flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl text-text-primary">Top agents</h1>
        <RangeChips current={range} label="Agent ranking range" />
      </div>
      <AgentsRankingTable agents={agents} emptyMessage="No verified agent activity yet" />
    </section>
  );
}
