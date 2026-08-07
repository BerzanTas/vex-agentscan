import Link from "next/link";
import type { ActivityRowDto } from "../lib/api";
import { formatAge, formatRawAmount, formatRawAmountDisplay, formatUsdEstimate } from "../lib/format";
import { ChainBadge } from "./ChainBadge";
import { EmptyPanel } from "./EmptyPanel";
import { ProtocolBadge } from "./ProtocolBadge";

const SWAP_GLYPH = "⇄";
const DIRECTIONAL_GLYPH = "→";

function kindGlyph(kind: string): string {
  return kind === "swap" ? SWAP_GLYPH : DIRECTIONAL_GLYPH;
}

function pairLabel(row: ActivityRowDto): string {
  if (row.tokenInSymbol === null || row.tokenOutSymbol === null) return row.eventRole.replace(/_/g, " ");
  return `${row.tokenInSymbol} → ${row.tokenOutSymbol}`;
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
        <span className="block text-xs text-text-muted">${formatUsdEstimate(row.usdInEst)} est.</span>
      )}
    </span>
  );
}

export function ActivityTable({ rows, emptyMessage }: { rows: ActivityRowDto[]; emptyMessage: string }) {
  if (rows.length === 0) {
    return <EmptyPanel message={emptyMessage} />;
  }
  return (
    <div className="glass overflow-x-auto">
      <table className="w-full text-left text-sm">
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
            <tr key={row.publicId} className="feed-row border-b border-bg-overlay/60 last:border-b-0">
              <td className="px-4 py-3">
                <Link
                  href={`/tx/${row.publicId}`}
                  className="feed-row-link"
                  aria-label={`${row.protocol} ${pairLabel(row)}`}
                >
                  <ProtocolBadge protocol={row.protocol} withName />
                </Link>
              </td>
              <td className="px-4 py-3 text-text-primary" title={row.kind}>
                <span className="feed-glyph" aria-hidden="true">
                  {kindGlyph(row.kind)}
                </span>
                {pairLabel(row)}
              </td>
              <td className="px-4 py-3">
                <AmountCell row={row} />
              </td>
              <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                <ChainCell row={row} />
              </td>
              <td className="px-4 py-3 font-mono text-xs text-text-muted">{formatAge(row.ageSeconds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
