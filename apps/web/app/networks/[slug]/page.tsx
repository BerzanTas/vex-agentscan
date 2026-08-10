import type { Metadata } from "next";
import { parseChartRange } from "../../../lib/range";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChainBadge } from "../../../components/ChainBadge";
import { TierBadge } from "../../../components/NetworksTable";
import { PageHeading } from "../../../components/PageHeading";
import { PanelHeading } from "../../../components/PanelHeading";
import { ProtocolRanking } from "../../../components/ProtocolRanking";
import { RangeChips } from "../../../components/RangeChips";
import { RoutesList } from "../../../components/RoutesList";
import { Sparkline } from "../../../components/Sparkline";
import { fetchNetworkDetail, type NetworkTokenStatDto } from "../../../lib/api";
import { formatUsdCompact, formatUsdAmount } from "../../../lib/format";

export const dynamic = "force-dynamic";

type NetworkDetailPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const ADDRESS_PREFIX_LENGTH = 6;
const ADDRESS_SUFFIX_LENGTH = 4;

function tokenLabel(token: NetworkTokenStatDto): string {
  if (token.symbol !== null) return token.symbol;
  const prefix = token.address.slice(0, ADDRESS_PREFIX_LENGTH);
  const suffix = token.address.slice(-ADDRESS_SUFFIX_LENGTH);
  return `${prefix}…${suffix}`;
}

function NetworkTokens({
  chainSlug,
  tokens,
}: {
  chainSlug: string;
  tokens: NetworkTokenStatDto[];
}) {
  if (tokens.length === 0) {
    return <p className="text-sm text-text-muted">No verified token activity in this window</p>;
  }
  return (
    <ul className="flex flex-col">
      {tokens.map((token) => (
        <li
          key={token.address}
          className="flex items-center gap-3 border-b border-bg-overlay/60 py-2 text-sm last:border-b-0"
        >
          <Link
            href={`/tokens/${chainSlug}/${token.address}`}
            className="text-text-primary"
            title={token.address}
          >
            {tokenLabel(token)}
          </Link>
          <span className="ml-auto font-mono text-xs text-text-muted">
            {token.txCount.toLocaleString("en-US")} tx
          </span>
          <span
            className="font-mono text-text-primary"
            title={`$${formatUsdAmount(token.volumeUsd)}`}
          >
            ${formatUsdCompact(token.volumeUsd)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export async function generateMetadata({
  params,
  searchParams,
}: NetworkDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const detail = await fetchNetworkDetail(slug, parseChartRange((await searchParams).range));
  if (detail === null) return { title: "Network not found - AgentScan" };
  return {
    title: `${detail.displayName} - AgentScan`,
    description: `Agent activity AgentScan observed on ${detail.displayName}`,
  };
}

export default async function NetworkDetailPage({ params, searchParams }: NetworkDetailPageProps) {
  const { slug } = await params;
  const range = parseChartRange((await searchParams).range);
  const detail = await fetchNetworkDetail(slug, range);
  if (detail === null) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div className="section-enter flex flex-col gap-4">
        <Link href="/networks" className="text-sm text-text-secondary hover:text-text-primary">
          ← Networks
        </Link>
        <PageHeading
          kicker="NETWORK // DETAIL"
          title={detail.displayName}
          actions={<RangeChips current={range} label="Network activity range" />}
        />
        <div className="flex flex-wrap items-center gap-3">
          <ChainBadge slug={detail.chainSlug} />
          <TierBadge tier={detail.verificationTier} />
        </div>
      </div>
      <div className="section-enter grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="glass verification-stat">
          <span className="table-head">Observed volume</span>
          <span
            className="verification-stat-value"
            title={`$${formatUsdAmount(detail.volumeUsd)}`}
          >
            ${formatUsdCompact(detail.volumeUsd)}
          </span>
        </div>
        <div className="glass verification-stat">
          <span className="table-head">Transactions</span>
          <span className="verification-stat-value">{detail.txCount.toLocaleString("en-US")}</span>
          <span className="text-xs text-text-muted">verified activities</span>
        </div>
        <div className="glass verification-stat">
          <span className="table-head">Volume trend</span>
          <Sparkline series={detail.series} label={`Observed volume on ${detail.displayName}`} />
        </div>
      </div>
      <div className="section-enter grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
        <section className="glass p-4">
          <PanelHeading title="Protocols" meta={range} />
          <ProtocolRanking protocols={detail.protocols} />
        </section>
        <section className="glass p-4">
          <PanelHeading title="Most traded tokens" meta={range} />
          <NetworkTokens chainSlug={detail.chainSlug} tokens={detail.tokens} />
        </section>
      </div>
      <section className="section-enter glass p-4">
        <PanelHeading title="Bridge routes" meta={range} />
        <RoutesList
          routes={detail.routes}
          emptyMessage="No bridge legs touching this network in this window"
        />
      </section>
    </div>
  );
}
