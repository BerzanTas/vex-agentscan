import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChainBadge } from "../../../components/ChainBadge";
import { LegsTable } from "../../../components/LegsTable";
import { PageHeading } from "../../../components/PageHeading";
import { PanelHeading } from "../../../components/PanelHeading";
import { StatusPill } from "../../../components/StatusPill";
import { StatusTimeline } from "../../../components/StatusTimeline";
import { TxHashChip } from "../../../components/TxHashChip";
import { VerificationBadge } from "../../../components/VerificationBadge";
import { fetchTxDetail, type TxDetailDto, type VexFeeDto } from "../../../lib/api";
import { formatAge, formatRawAmount, formatUsdAmount } from "../../../lib/format";
import { legLabel } from "../../../lib/leg-label";

export const revalidate = 30;

type TxPageProps = { params: Promise<{ publicId: string }> };

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function pairLabel(detail: TxDetailDto): string {
  return legLabel(detail, "→");
}

function spentSummary(detail: TxDetailDto): string | null {
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

// A borrow, a collateral withdrawal and a reward claim spend nothing, so the spent leg is empty and
// the received one is the only amount the row carries.
function receivedSummary(detail: TxDetailDto): string | null {
  if (detail.tokenOutDecimals === null || detail.executedOutRaw === null) return null;
  const symbol = detail.tokenOutSymbol === null ? "" : ` ${detail.tokenOutSymbol}`;
  return `${formatRawAmount(detail.executedOutRaw, detail.tokenOutDecimals)}${symbol}`;
}

function amountSummary(detail: TxDetailDto): string | null {
  return spentSummary(detail) ?? receivedSummary(detail);
}

function networkLabel(detail: TxDetailDto): string {
  return detail.chainSlug ?? "unknown network";
}

// The Vex integrator fee is a SEPARATE transaction - its own hash, its own status - but it belongs
// to this action, so it gets a panel here instead of a record of its own. A fee that confirmed
// against an action that then failed is still shown: it was really charged.
function VexFeePanel({ fee }: { fee: VexFeeDto }) {
  const amount =
    fee.amountRaw === null || fee.decimals === null
      ? null
      : formatRawAmount(fee.amountRaw, fee.decimals);
  const symbol = fee.symbol === null ? "" : ` ${fee.symbol}`;
  return (
    <section className="section-enter glass p-4">
      <PanelHeading title="Vex fee" />
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-text-muted">Amount</dt>
        <dd className="font-mono text-text-secondary">
          {amount === null ? "charged" : `${amount}${symbol}`}
          {fee.usdEst !== null && ` · $${formatUsdAmount(fee.usdEst)} est.`}
        </dd>
        <dt className="text-text-muted">Status</dt>
        <dd>
          <StatusPill status={fee.status} />
        </dd>
        <dt className="text-text-muted">Transaction</dt>
        <dd>
          {fee.txHash !== null ? (
            <TxHashChip txHash={fee.txHash} explorerUrl={fee.explorerUrl} />
          ) : (
            <span className="text-text-muted">—</span>
          )}
        </dd>
      </dl>
    </section>
  );
}

export async function generateMetadata({ params }: TxPageProps): Promise<Metadata> {
  const { publicId } = await params;
  const detail = await fetchTxDetail(publicId);
  if (detail === null) return { title: "Transaction not found - AgentScan" };
  const description = [amountSummary(detail), statusLabel(detail.status), networkLabel(detail)]
    .filter((part) => part !== null)
    .join(" · ");
  return {
    title: `${pairLabel(detail)} via ${detail.protocol} - AgentScan`,
    openGraph: { description },
  };
}

export default async function TxDetailPage({ params }: TxPageProps) {
  const { publicId } = await params;
  const detail = await fetchTxDetail(publicId);
  if (detail === null) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div className="section-enter flex flex-col gap-4">
        <Link href="/activity" className="text-sm text-text-secondary hover:text-text-primary">
          ← Activity
        </Link>
        <PageHeading kicker="VERIFIED RECORD // ACTIVITY" title={pairLabel(detail)} />
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded bg-bg-overlay px-2 py-0.5 text-xs text-text-secondary">
            {detail.kind}
          </span>
          <span className="rounded bg-bg-overlay px-2 py-0.5 text-xs text-accent">
            {detail.protocol}
          </span>
          {detail.chainSlug !== null && (
            <span className="rounded bg-bg-overlay px-2 py-0.5 font-mono text-xs text-text-secondary">
              {detail.chainSlug}
            </span>
          )}
          <StatusPill status={detail.status} />
          <VerificationBadge state={detail.verificationState} />
        </div>
      </div>
      <div className="section-enter grid grid-cols-1 gap-8 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <PanelHeading title="Amounts" />
          <LegsTable detail={detail} />
        </section>
        <section>
          <PanelHeading title="Timeline" />
          <StatusTimeline source={detail} />
        </section>
      </div>
      {detail.vexFee !== null && <VexFeePanel fee={detail.vexFee} />}
      <section className="section-enter glass p-4">
        <PanelHeading title="Details" />
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-text-muted">Network</dt>
          <dd className="font-mono text-text-secondary">
            {detail.chainSlug === null ? "—" : <ChainBadge slug={detail.chainSlug} />}
          </dd>
          <dt className="text-text-muted">Transaction</dt>
          <dd>
            {detail.txHash !== null ? (
              <TxHashChip txHash={detail.txHash} explorerUrl={detail.explorerUrl} />
            ) : (
              <span className="text-text-muted">—</span>
            )}
          </dd>
          <dt className="text-text-muted">Fee</dt>
          <dd className="font-mono text-text-secondary">
            {detail.usdFeeEst === null ? "—" : `$${formatUsdAmount(detail.usdFeeEst)} est.`}
          </dd>
          <dt className="text-text-muted">USD source</dt>
          <dd className="text-text-secondary">{detail.usdSource ?? "—"}</dd>
          <dt className="text-text-muted">Age</dt>
          <dd className="font-mono text-text-secondary">{formatAge(detail.ageSeconds)}</dd>
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
