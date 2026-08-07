import type { ChainTierDto, VerificationStatsDto, VerificationTier } from "../lib/api";
import { formatLatency } from "../lib/format";
import { ChainBadge } from "./ChainBadge";
import { EmptyPanel } from "./EmptyPanel";
import { PanelHeading } from "./PanelHeading";

const TIER_DIFFERENCE =
  "Full verification compares the amounts recorded on chain; basic verification confirms only that the transaction exists and when it happened.";

const NOTHING_MEASURED_YET = "—";

const BAR_TRACK_FILL = "rgba(31,68,255,0.14)";
const FULL_BAR_FILL = "#1f44ff";
const BASIC_BAR_FILL = "rgba(31,68,255,0.38)";

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function latencyLabel(seconds: number | null): string {
  if (seconds === null) return NOTHING_MEASURED_YET;
  return formatLatency(seconds);
}

function fullSharePercent(full: number, basic: number): number | null {
  const verified = full + basic;
  if (verified === 0) return null;
  return Math.round((full / verified) * 100);
}

function formatShare(percent: number | null): string {
  if (percent === null) return NOTHING_MEASURED_YET;
  return `${percent}%`;
}

function SplitLegend({ label, count, share }: { label: string; count: number; share: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="verification-stat-value">{formatCount(count)}</span>
        <span className="font-mono text-xs text-text-muted">{share}</span>
      </span>
    </div>
  );
}

function VerificationSplit({ full, basic }: { full: number; basic: number }) {
  const fullPercent = fullSharePercent(full, basic);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <SplitLegend label="Full verification" count={full} share={formatShare(fullPercent)} />
        <SplitLegend
          label="Basic verification"
          count={basic}
          share={formatShare(fullPercent === null ? null : 100 - fullPercent)}
        />
      </div>
      <svg
        className="h-1.5 w-full"
        viewBox="0 0 100 4"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <rect x="0" y="0" width="100" height="4" rx="2" fill={BAR_TRACK_FILL} />
        {fullPercent !== null && (
          <g>
            <rect x="0" y="0" width={fullPercent} height="4" rx="2" fill={FULL_BAR_FILL} />
            <rect
              x={fullPercent}
              y="0"
              width={100 - fullPercent}
              height="4"
              rx="2"
              fill={BASIC_BAR_FILL}
            />
          </g>
        )}
      </svg>
    </div>
  );
}

function VerificationStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="verification-stat glass">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="verification-stat-value">{value}</span>
    </div>
  );
}

function TierBadge({ tier }: { tier: VerificationTier }) {
  return <span className={`tier-badge tier-badge-${tier}`}>{tier}</span>;
}

function ChainTierTable({ chains }: { chains: ChainTierDto[] }) {
  if (chains.length === 0) {
    return <EmptyPanel message="The chain registry lists no networks" withLiveDot={false} />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="dimension-table">
        <thead>
          <tr>
            <th className="table-head font-normal">Network</th>
            <th className="table-head font-normal">Name</th>
            <th className="table-head font-normal">Verification</th>
          </tr>
        </thead>
        <tbody>
          {chains.map((chain) => (
            <tr key={chain.chainSlug}>
              <td className="font-mono text-xs text-text-secondary">
                <ChainBadge slug={chain.chainSlug} />
              </td>
              <td className="text-text-primary">{chain.displayName}</td>
              <td>
                <TierBadge tier={chain.verificationTier} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function VerificationPanels({ stats }: { stats: VerificationStatsDto }) {
  return (
    <div className="flex flex-col gap-8">
      <section className="glass p-4">
        <PanelHeading title="Verified activity" meta="all time" />
        <VerificationSplit full={stats.verifiedFull} basic={stats.verifiedBasic} />
        <p className="mt-4 text-sm text-text-secondary">{TIER_DIFFERENCE}</p>
      </section>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <VerificationStat
          label="Median verification latency"
          value={latencyLabel(stats.latencySeconds.median)}
        />
        <VerificationStat
          label="90th percentile latency"
          value={latencyLabel(stats.latencySeconds.p90)}
        />
        <VerificationStat label="Waiting in verification queue" value={formatCount(stats.queued)} />
      </div>
      <section className="glass p-4">
        <PanelHeading title="Chains we can verify" meta="from the chain registry" />
        <ChainTierTable chains={stats.chains} />
      </section>
    </div>
  );
}
