import type { Metadata } from "next";
import { parseChartRange } from "../../lib/range";
import { PageHeading } from "../../components/PageHeading";
import { PricingCoverageNote } from "../../components/PricingCoverageNote";
import { RangeChips } from "../../components/RangeChips";
import { TokensTable } from "../../components/TokensTable";
import { fetchPricingCoverage, fetchTokens } from "../../lib/api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tokens - AgentScan",
  description: "Tokens swapped and bridged by Vex agents, ranked by observed volume",
};

type SearchParams = Record<string, string | string[] | undefined>;

export default async function TokensPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const range = parseChartRange((await searchParams).range);
  const [tokens, coverage] = await Promise.all([fetchTokens(range), fetchPricingCoverage(range)]);

  return (
    <section className="section-enter flex flex-col gap-6">
      <PageHeading
        kicker="REGISTRY // TOKENS"
        title="Tokens"
        description="Tokens swapped and bridged by Vex agents, by the volume we observed on chain."
        actions={<RangeChips current={range} label="Token window" />}
      />
      <TokensTable rows={tokens} emptyMessage="No token activity in this window" />
      <p className="max-w-3xl text-xs text-text-muted">
        These are volumes observed in Vex agent activity, not market volume. One swap contributes to
        both of its tokens, so this column does not sum to total volume.
      </p>
      <PricingCoverageNote coverage={coverage} />
    </section>
  );
}
