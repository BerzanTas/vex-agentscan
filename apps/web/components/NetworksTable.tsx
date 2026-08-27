import type { NetworkStatDto, VerificationTier } from "../lib/api";
import { formatAge, formatUsdCompact, formatUsdAmount } from "../lib/format";
import { ChainBadge } from "./ChainBadge";
import { FeedRowLink } from "./FeedRowLink";

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

function NetworkRow({ network }: { network: NetworkStatDto }) {
  const href = `/networks/${network.chainSlug}`;
  return (
    <tr className="feed-row">
      <td>
        <FeedRowLink href={href} ariaLabel={network.displayName}>
          <span className="token-cell">
            <ChainBadge slug={network.chainSlug} />
            <span className="text-xs text-text-muted">{network.displayName}</span>
          </span>
        </FeedRowLink>
      </td>
      <td>
        <FeedRowLink href={href}>
          <TierBadge tier={network.verificationTier} />
        </FeedRowLink>
      </td>
      <td
        className="text-right font-mono text-text-primary"
        title={`$${formatUsdAmount(network.volumeUsd)}`}
      >
        <FeedRowLink href={href}>${formatUsdCompact(network.volumeUsd)}</FeedRowLink>
      </td>
      <td className="text-right font-mono text-xs text-text-secondary">
        <FeedRowLink href={href}>{network.txCount.toLocaleString("en-US")}</FeedRowLink>
      </td>
      <td className="hidden text-right font-mono text-xs text-text-secondary md:table-cell">
        <FeedRowLink href={href}>{bridgeLegLabel(network)}</FeedRowLink>
      </td>
      <td className="hidden text-right font-mono text-xs text-text-muted md:table-cell">
        <FeedRowLink href={href}>{lastSeenLabel(network.lastSeenSeconds)}</FeedRowLink>
      </td>
    </tr>
  );
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
            <th className="table-head hidden text-right font-normal md:table-cell">
              Bridge in / out
            </th>
            <th className="table-head hidden text-right font-normal md:table-cell">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {networks.map((network) => (
            <NetworkRow key={network.chainSlug} network={network} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
