import type { ActivityRowDto } from "../lib/api";
import { formatAge, formatRawAmount, formatRawAmountDisplay, formatUsdAmount } from "../lib/format";
import { legLabel } from "../lib/leg-label";
import { ChainBadge } from "./ChainBadge";
import { EmptyPanel } from "./EmptyPanel";
import { FeedRowLink } from "./FeedRowLink";
import { ProtocolBadge } from "./ProtocolBadge";

const SWAP_GLYPH = "⇄";
const DIRECTIONAL_GLYPH = "→";

function kindGlyph(kind: string): string {
  return kind === "swap" ? SWAP_GLYPH : DIRECTIONAL_GLYPH;
}

function pairLabel(row: ActivityRowDto): string {
  return legLabel(row, " → ");
}

function ChainCell({ row }: { row: ActivityRowDto }) {
  if (row.fromChainSlug !== null && row.toChainSlug !== null) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <ChainBadge slug={row.fromChainSlug} />
        <span className="route-arrow" aria-hidden="true">
          {DIRECTIONAL_GLYPH}
        </span>
        <ChainBadge slug={row.toChainSlug} />
      </span>
    );
  }
  if (row.chainSlug === null) return <>—</>;
  return <ChainBadge slug={row.chainSlug} />;
}

function AmountCell({ row }: { row: ActivityRowDto }) {
  if (row.amountInRaw === null || row.tokenInDecimals === null) {
    return <span className="text-text-muted">—</span>;
  }
  return (
    <span className="font-mono">
      <span title={formatRawAmount(row.amountInRaw, row.tokenInDecimals)}>
        {formatRawAmountDisplay(row.amountInRaw, row.tokenInDecimals)}
      </span>
      {row.tokenInSymbol !== null && <span className="ml-1 text-text-muted">{row.tokenInSymbol}</span>}
      {row.usdInEst !== null && (
        <span className="block text-xs text-text-muted">${formatUsdAmount(row.usdInEst)} est.</span>
      )}
    </span>
  );
}

function ActivityRow({ row }: { row: ActivityRowDto }) {
  const href = `/tx/${row.publicId}`;
  return (
    <tr className="feed-row border-b border-bg-overlay/60 last:border-b-0">
      <td>
        <FeedRowLink href={href} ariaLabel={`${row.protocol} ${pairLabel(row)}`}>
          <ProtocolBadge protocol={row.protocol} withName />
        </FeedRowLink>
      </td>
      <td className="text-text-primary" title={row.kind}>
        <FeedRowLink href={href}>
          <span className="feed-glyph" aria-hidden="true">
            {kindGlyph(row.kind)}
          </span>
          {pairLabel(row)}
        </FeedRowLink>
      </td>
      <td>
        <FeedRowLink href={href}>
          <AmountCell row={row} />
        </FeedRowLink>
      </td>
      <td className="font-mono text-xs text-text-secondary">
        <FeedRowLink href={href}>
          <ChainCell row={row} />
        </FeedRowLink>
      </td>
      <td className="font-mono text-xs text-text-muted">
        <FeedRowLink href={href}>{formatAge(row.ageSeconds)}</FeedRowLink>
      </td>
    </tr>
  );
}

export function ActivityTable({ rows, emptyMessage }: { rows: ActivityRowDto[]; emptyMessage: string }) {
  if (rows.length === 0) {
    return <EmptyPanel message={emptyMessage} />;
  }
  return (
    <div className="glass overflow-x-auto overflow-y-clip">
      <table className="feed-table w-full text-left text-sm">
        <thead>
          <tr className="border-b border-bg-overlay text-xs text-text-muted">
            <th className="table-head px-4 py-3 font-normal">Protocol</th>
            <th className="table-head px-4 py-3 font-normal">Pair</th>
            <th className="table-head px-4 py-3 font-normal">Amount</th>
            <th className="table-head px-4 py-3 font-normal">Chain</th>
            <th className="table-head px-4 py-3 font-normal">Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <ActivityRow key={row.publicId} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
