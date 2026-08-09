import type { Metadata } from "next";
import { parseChartRange } from "../../../../lib/range";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChainBadge } from "../../../../components/ChainBadge";
import { PageHeading } from "../../../../components/PageHeading";
import { PanelHeading } from "../../../../components/PanelHeading";
import { ProtocolRanking } from "../../../../components/ProtocolRanking";
import { RangeChips } from "../../../../components/RangeChips";
import { Sparkline } from "../../../../components/Sparkline";
import { shortenAddress } from "../../../../components/TokensTable";
import {
  fetchTokenDetail,
  type TokenDetailDto,
  type TokenPairStatDto,
} from "../../../../lib/api";
import { formatUsdCompact, formatUsdEstimate } from "../../../../lib/format";

export const dynamic = "force-dynamic";

const UNKNOWN_SYMBOL = "unknown";

type SearchParams = Record<string, string | string[] | undefined>;

type TokenPageProps = {
  params: Promise<{ chainSlug: string; address: string }>;
  searchParams: Promise<SearchParams>;
};

function tokenTitle(detail: TokenDetailDto): string {
  return detail.symbol ?? shortenAddress(detail.address);
}

function pairKey(pair: TokenPairStatDto): string {
  return `${pair.tokenInSymbol ?? UNKNOWN_SYMBOL}-${pair.tokenOutSymbol ?? UNKNOWN_SYMBOL}`;
}

export async function generateMetadata({ params, searchParams }: TokenPageProps): Promise<Metadata> {
  const { chainSlug, address } = await params;
  const detail = await fetchTokenDetail(chainSlug, address, parseChartRange((await searchParams).range));
  if (detail === null) return { title: "Token not found - AgentScan" };
  return {
    title: `${tokenTitle(detail)} on ${detail.chainSlug} - AgentScan`,
    description: `Vex agent activity observed for ${tokenTitle(detail)} on ${detail.chainSlug}`,
  };
}

export default async function TokenDetailPage({ params, searchParams }: TokenPageProps) {
  const { chainSlug, address } = await params;
  const range = parseChartRange((await searchParams).range);
  const detail = await fetchTokenDetail(chainSlug, address, range);
  if (detail === null) notFound();

  const windowLabel = range.toUpperCase();

  return (
    <div className="flex flex-col gap-8">
      <div className="section-enter flex flex-col gap-4">
        <Link href="/tokens" className="text-sm text-text-secondary hover:text-text-primary">
          ← Tokens
        </Link>
        <PageHeading
          kicker="TOKEN // DETAIL"
          title={tokenTitle(detail)}
          actions={<RangeChips current={range} label="Token window" />}
        />
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded bg-bg-overlay px-2 py-0.5 text-xs text-text-secondary">
            <ChainBadge slug={detail.chainSlug} />
          </span>
          <span className="token-address">{detail.address}</span>
          {detail.decimals !== null && (
            <span className="text-xs text-text-muted">{detail.decimals} decimals</span>
          )}
        </div>
      </div>
      <div className="section-enter grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="glass stat-card">
          <div className="stat-card-head">
            <span className="stat-card-label">Observed volume</span>
            <span className="stat-card-window">{windowLabel}</span>
          </div>
          <p className="stat-card-value" title={`$${formatUsdEstimate(detail.volumeUsd)}`}>
            ${formatUsdCompact(detail.volumeUsd)}
          </p>
        </div>
        <div className="glass stat-card">
          <div className="stat-card-head">
            <span className="stat-card-label">Transactions</span>
            <span className="stat-card-window">{windowLabel}</span>
          </div>
          <p className="stat-card-value">{detail.txCount.toLocaleString("en-US")}</p>
        </div>
        <div className="glass stat-card">
          <div className="stat-card-head">
            <span className="stat-card-label">Observed volume trend</span>
          </div>
          <Sparkline
            series={detail.series}
            label={`Observed volume of ${tokenTitle(detail)} over the selected window`}
          />
        </div>
      </div>
      <div className="section-enter grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
        <section className="glass p-4">
          <PanelHeading title="Protocols" meta={windowLabel} />
          <ProtocolRanking protocols={detail.protocols} />
        </section>
        <section className="glass p-4">
          <PanelHeading title="Top pairs" meta={windowLabel} />
          {detail.pairs.length === 0 ? (
            <p className="text-sm text-text-muted">No pairs observed in this window</p>
          ) : (
            <ul>
              {detail.pairs.map((pair) => (
                <li key={pairKey(pair)} className="route-row">
                  <span>{pair.tokenInSymbol ?? UNKNOWN_SYMBOL}</span>
                  <span className="route-arrow" aria-hidden="true">
                    →
                  </span>
                  <span>{pair.tokenOutSymbol ?? UNKNOWN_SYMBOL}</span>
                  <span className="ml-auto text-text-muted">
                    {`${pair.txCount.toLocaleString("en-US")} tx`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <p className="section-enter max-w-3xl text-xs text-text-muted">
        Volumes are observed in Vex agent activity, not market volume. A swap counts on both of its
        tokens.
      </p>
    </div>
  );
}
