import Link from "next/link";
import type { NetworkStatDto, VerificationTier } from "../lib/api";
import { formatAge, formatUsdCompact, formatUsdAmount } from "../lib/format";
import { ChainBadge } from "./ChainBadge";

const TIER_BADGE_CLASS: Record<VerificationTier, string> = {
  full: "tier-badge tier-badge-full",
  basic: "tier-badge tier-badge-basic",
};

export function TierBadge({ tier }: { tier: VerificationTier }) {
  return <span className={TIER_BADGE_CLASS[tier]}>{tier}</span>;
}

function lastSeenLabel(lastSeenSeconds: number | null): string {
  if (lastSeenSeconds === null) return "—";
  return formatAge(lastSeenSeconds);
}

function bridgeLegLabel(network: NetworkStatDto): string {
  const incoming = network.bridgeInCount.toLocaleString("en-US");
  const outgoing = network.bridgeOutCount.toLocaleString("en-US");
  return `${incoming} / ${outgoing}`;
}

export function NetworksTable({ networks }: { networks: NetworkStatDto[] }) {
  return (
    <div className="glass overflow-x-auto overflow-y-clip">
      <table className="dimension-table">
        <thead>
          <tr>
            <th className="table-head font-normal">Network</th>
            <th className="table-head font-normal">Verification</th>
            <th className="table-head font-normal text-right">Observed volume</th>
            <th className="table-head font-normal text-right">Txns</th>
            <th className="table-head font-normal text-right">Bridge in / out</th>
            <th className="table-head font-normal text-right">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {networks.map((network) => (
            <tr key={network.chainSlug} className="feed-row">
              <td>
                <Link
                  href={`/networks/${network.chainSlug}`}
                  className="feed-row-link"
                  aria-label={network.displayName}
                >
                  <span className="token-cell">
                    <ChainBadge slug={network.chainSlug} />
                    <span className="text-xs text-text-muted">{network.displayName}</span>
                  </span>
                </Link>
              </td>
              <td>
                <TierBadge tier={network.verificationTier} />
              </td>
              <td
                className="text-right font-mono text-text-primary"
                title={`$${formatUsdAmount(network.volumeUsd)}`}
              >
                ${formatUsdCompact(network.volumeUsd)}
              </td>
              <td className="text-right font-mono text-xs text-text-secondary">
                {network.txCount.toLocaleString("en-US")}
              </td>
              <td className="text-right font-mono text-xs text-text-secondary">
                {bridgeLegLabel(network)}
              </td>
              <td className="text-right font-mono text-xs text-text-muted">
                {lastSeenLabel(network.lastSeenSeconds)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
