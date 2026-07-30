import Link from "next/link";
import type { ActivityRowDto } from "../lib/api";
import { formatAge, formatRawAmount, formatRawAmountDisplay, formatUsdEstimate } from "../lib/format";
import { ChainBadge } from "./ChainBadge";
import { ProtocolBadge } from "./ProtocolBadge";
import { StatusPill } from "./StatusPill";
import { VerificationBadge } from "./VerificationBadge";

function ExplorerIcon() {
  return (
    <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" aria-hidden="true">
      <path
        d="M6 3H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V8M8.5 3H11v2.5M11 3 6.5 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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
        <span className="ml-2 text-xs text-text-muted">
          ${formatUsdEstimate(row.usdInEst)} est.
        </span>
      )}
    </span>
  );
}

function PairCell({ row }: { row: ActivityRowDto }) {
  const pair =
    row.tokenInSymbol !== null && row.tokenOutSymbol !== null
      ? `${row.tokenInSymbol} → ${row.tokenOutSymbol}`
      : row.eventRole.replace(/_/g, " ");
  return (
    <Link href={`/tx/${row.publicId}`} className="text-text-primary hover:text-accent">
      {pair}
    </Link>
  );
}

export function ActivityTable({ rows }: { rows: ActivityRowDto[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-text-muted">No activity yet</p>;
  }
  return (
    <div className="card card-hover overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-bg-overlay text-xs text-text-muted">
            <th className="px-4 py-3 font-normal">Kind</th>
            <th className="px-4 py-3 font-normal">Protocol</th>
            <th className="px-4 py-3 font-normal">Pair</th>
            <th className="px-4 py-3 font-normal">Amount</th>
            <th className="px-4 py-3 font-normal">Status</th>
            <th className="px-4 py-3 font-normal">Verified</th>
            <th className="px-4 py-3 font-normal">Chain</th>
            <th className="px-4 py-3 font-normal">Age</th>
            <th className="px-4 py-3 font-normal">Tx</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.publicId} className="feed-row border-b border-bg-overlay/60 last:border-b-0">
              <td className="px-4 py-3">
                <span className="rounded bg-bg-overlay px-2 py-0.5 text-xs text-text-secondary">
                  {row.kind}
                </span>
              </td>
              <td className="px-4 py-3">
                <ProtocolBadge protocol={row.protocol} />
              </td>
              <td className="px-4 py-3">
                <PairCell row={row} />
              </td>
              <td className="px-4 py-3">
                <AmountCell row={row} />
              </td>
              <td className="px-4 py-3">
                <StatusPill status={row.status} />
              </td>
              <td className="px-4 py-3">
                {row.verificationState === "verified_full" ||
                row.verificationState === "verified_basic" ? (
                  <VerificationBadge state={row.verificationState} />
                ) : (
                  <span className="text-text-muted">—</span>
                )}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                {row.chainSlug === null ? "—" : <ChainBadge slug={row.chainSlug} />}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-text-muted">
                {formatAge(row.ageSeconds)}
              </td>
              <td className="px-4 py-3">
                {row.explorerUrl !== null ? (
                  <a
                    href={row.explorerUrl}
                    target="_blank"
                    rel="noopener"
                    aria-label="Open in explorer"
                    className="inline-flex text-accent hover:text-text-primary"
                  >
                    <ExplorerIcon />
                  </a>
                ) : (
                  <span className="text-text-muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
