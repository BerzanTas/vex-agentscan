import type { Metadata } from "next";
import { parseChartRange } from "../../lib/range";
import { LoadMoreTokens } from "../../components/LoadMoreTokens";
import { PageHeading } from "../../components/PageHeading";
import { RangeChips } from "../../components/RangeChips";
import { fetchTokens } from "../../lib/api";

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
  const listing = await fetchTokens(range);

  return (
    <section className="section-enter flex flex-col gap-6">
      <PageHeading
        kicker="REGISTRY // TOKENS"
        title="Tokens"
        description="Tokens swapped and bridged by Vex agents, by the volume we observed on chain."
        actions={<RangeChips current={range} label="Token window" />}
      />
      <LoadMoreTokens
        key={range}
        initialItems={listing.items}
        initialCursor={listing.nextCursor}
        range={range}
      />
    </section>
  );
}
