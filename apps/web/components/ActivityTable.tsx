import Link from "next/link";
import type { ActivityRowDto } from "../lib/api";
import { formatAge, formatRawAmount, formatUsdEstimate } from "../lib/format";

const statusToneClass: Record<string, string> = {
  confirmed: "text-success",
  pending: "text-warning",
  definitively_failed: "text-danger",
};

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function AmountCell({ row }: { row: ActivityRowDto }) {
  if (row.amountInRaw === null || row.tokenInDecimals === null) {
    return <span className="text-text-muted">—</span>;
  }
  return (
    <span className="font-mono">
      {formatRawAmount(row.amountInRaw, row.tokenInDecimals)}
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
    <div className="overflow-x-auto rounded-lg border border-bg-overlay bg-bg-elevated">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-bg-overlay text-xs text-text-muted">
            <th className="px-4 py-3 font-normal">Kind</th>
            <th className="px-4 py-3 font-normal">Protocol</th>
            <th className="px-4 py-3 font-normal">Pair</th>
            <th className="px-4 py-3 font-normal">Amount</th>
            <th className="px-4 py-3 font-normal">Status</th>
            <th className="px-4 py-3 font-normal">Chain</th>
            <th className="px-4 py-3 font-normal">Age</th>
            <th className="px-4 py-3 font-normal">Tx</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.publicId} className="border-b border-bg-overlay/60 last:border-b-0">
              <td className="px-4 py-3">
                <span className="rounded bg-bg-overlay px-2 py-0.5 text-xs text-text-secondary">
                  {row.kind}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="rounded bg-bg-overlay px-2 py-0.5 text-xs text-accent">
                  {row.protocol}
                </span>
              </td>
              <td className="px-4 py-3">
                <PairCell row={row} />
              </td>
              <td className="px-4 py-3">
                <AmountCell row={row} />
              </td>
              <td className={`px-4 py-3 ${statusToneClass[row.status] ?? "text-text-secondary"}`}>
                {statusLabel(row.status)}
              </td>
              <td className="px-4 py-3 text-text-secondary">{row.chainSlug ?? "—"}</td>
              <td className="px-4 py-3 font-mono text-xs text-text-muted">
                {formatAge(row.ageSeconds)}
              </td>
              <td className="px-4 py-3">
                {row.explorerUrl !== null ? (
                  <a
                    href={row.explorerUrl}
                    target="_blank"
                    rel="noopener"
                    className="text-accent hover:underline"
                  >
                    view
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
