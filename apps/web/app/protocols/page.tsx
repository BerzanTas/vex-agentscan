import type { Metadata } from "next";
import { parseChartRange } from "../../lib/range";
import { ProtocolsRankingTable } from "../../components/ProtocolsRankingTable";
import { RangeChips } from "../../components/RangeChips";
import { fetchProtocolRanking } from "../../lib/api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Protocols — AgentScan",
  description: "Protocols ranked by the volume observed in verified Vex agent activity",
};

type ProtocolsPageProps = { searchParams: Promise<{ range?: string | string[] }> };

export default async function ProtocolsPage({ searchParams }: ProtocolsPageProps) {
  const range = parseChartRange((await searchParams).range);
  const protocols = await fetchProtocolRanking(range);

  return (
    <section className="section-enter flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl text-text-primary">Protocols</h1>
        <RangeChips current={range} label="Protocol ranking range" />
      </div>
      <ProtocolsRankingTable protocols={protocols} emptyMessage="No verified activity yet" />
    </section>
  );
}
