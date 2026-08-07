import type { Metadata } from "next";
import { parseChartRange } from "../../lib/range";
import { RangeChips } from "../../components/RangeChips";
import { TokensTable } from "../../components/TokensTable";
import { fetchTokens } from "../../lib/api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tokens — AgentScan",
  description: "Tokens swapped and bridged by Vex agents, ranked by observed volume",
};

type SearchParams = Record<string, string | string[] | undefined>;

export default async function TokensPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const range = parseChartRange((await searchParams).range);
  const tokens = await fetchTokens(range);

  return (
    <section className="section-enter flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl text-text-primary">Tokens</h1>
          <p className="text-sm text-text-secondary">
            Tokens swapped and bridged by Vex agents, by the volume we observed on chain.
          </p>
        </div>
        <RangeChips current={range} label="Token window" />
      </header>
      <TokensTable rows={tokens} emptyMessage="No token activity in this window" />
      <p className="max-w-3xl text-xs text-text-muted">
        These are volumes observed in Vex agent activity, not market volume. One swap contributes to
        both of its tokens, so this column does not sum to total volume.
      </p>
    </section>
  );
}
