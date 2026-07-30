import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegsTable } from "../../../components/LegsTable";
import { StatusTimeline } from "../../../components/StatusTimeline";
import { fetchTxDetail, type TxDetailDto } from "../../../lib/api";
import { formatRawAmount, formatUsdEstimate } from "../../../lib/format";

export const revalidate = 30;

type TxPageProps = { params: Promise<{ publicId: string }> };

const statusToneClass: Record<string, string> = {
  confirmed: "text-success",
  pending: "text-warning",
  definitively_failed: "text-danger",
};

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function pairLabel(detail: TxDetailDto): string {
  if (detail.tokenInSymbol !== null && detail.tokenOutSymbol !== null) {
    return `${detail.tokenInSymbol}→${detail.tokenOutSymbol}`;
  }
  return detail.eventRole.replace(/_/g, " ");
}

function amountSummary(detail: TxDetailDto): string | null {
  if (detail.tokenInDecimals === null) return null;
  const symbol = detail.tokenInSymbol === null ? "" : ` ${detail.tokenInSymbol}`;
  if (detail.executedInRaw !== null) {
    return `${formatRawAmount(detail.executedInRaw, detail.tokenInDecimals)}${symbol}`;
  }
  if (detail.amountInRaw !== null) {
    return `${formatRawAmount(detail.amountInRaw, detail.tokenInDecimals)}${symbol} est.`;
  }
  return null;
}

function networkLabel(detail: TxDetailDto): string {
  return detail.chainSlug ?? "unknown network";
}

export async function generateMetadata({ params }: TxPageProps): Promise<Metadata> {
  const { publicId } = await params;
  const detail = await fetchTxDetail(publicId);
  if (detail === null) return { title: "Transaction not found — AgentScan" };
  const description = [amountSummary(detail), statusLabel(detail.status), networkLabel(detail)]
    .filter((part) => part !== null)
    .join(" · ");
  return {
    title: `${pairLabel(detail)} via ${detail.protocol} — AgentScan`,
    openGraph: { description },
  };
}

function TxHashCell({ detail }: { detail: TxDetailDto }) {
  if (detail.txHash === null) return <span className="text-text-muted">—</span>;
  if (detail.explorerUrl === null) {
    return <span className="font-mono break-all">{detail.txHash}</span>;
  }
  return (
    <a
      href={detail.explorerUrl}
      target="_blank"
      rel="noopener"
      className="font-mono break-all text-accent hover:underline"
    >
      {detail.txHash}
    </a>
  );
}

export default async function TxDetailPage({ params }: TxPageProps) {
  const { publicId } = await params;
  const detail = await fetchTxDetail(publicId);
  if (detail === null) notFound();

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl text-text-primary">{pairLabel(detail)}</h1>
        <span className="rounded bg-bg-overlay px-2 py-0.5 text-xs text-text-secondary">
          {detail.kind}
        </span>
        <span className="rounded bg-bg-overlay px-2 py-0.5 text-xs text-accent">
          {detail.protocol}
        </span>
        <span className={`text-sm ${statusToneClass[detail.status] ?? "text-text-secondary"}`}>
          {statusLabel(detail.status)}
        </span>
      </header>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <h2 className="mb-4 text-sm text-text-secondary">Legs</h2>
          <LegsTable detail={detail} />
        </section>
        <section>
          <h2 className="mb-4 text-sm text-text-secondary">Timeline</h2>
          <StatusTimeline source={detail} />
        </section>
      </div>
      <section className="rounded-lg border border-bg-overlay bg-bg-elevated p-4">
        <h2 className="mb-4 text-sm text-text-secondary">Details</h2>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-text-muted">Network</dt>
          <dd className="text-text-secondary">{detail.chainSlug ?? "—"}</dd>
          <dt className="text-text-muted">Transaction</dt>
          <dd>
            <TxHashCell detail={detail} />
          </dd>
          <dt className="text-text-muted">Fee</dt>
          <dd className="font-mono text-text-secondary">
            {detail.usdFeeEst === null ? "—" : `$${formatUsdEstimate(detail.usdFeeEst)} est.`}
          </dd>
          <dt className="text-text-muted">USD source</dt>
          <dd className="text-text-secondary">{detail.usdSource ?? "—"}</dd>
          {detail.failureCode !== null && (
            <>
              <dt className="text-text-muted">Failure code</dt>
              <dd className="text-danger">{detail.failureCode.replace(/_/g, " ")}</dd>
            </>
          )}
        </dl>
      </section>
    </div>
  );
}
