import type { ProtocolRankingDto } from "../lib/api";
import { formatUsdCompact, formatUsdEstimate } from "../lib/format";
import { EmptyPanel } from "./EmptyPanel";
import { ProtocolBadge } from "./ProtocolBadge";

const FULL_BAR = 100;

function countLabel(count: number): string {
  return count.toLocaleString("en-US");
}

function swapBarWidth(row: ProtocolRankingDto): number {
  if (row.txCount <= 0) return 0;
  return Math.min(FULL_BAR, (row.swapTxCount / row.txCount) * FULL_BAR);
}

function splitTitle(row: ProtocolRankingDto): string {
  return `${countLabel(row.swapTxCount)} swap and ${countLabel(row.bridgeTxCount)} bridge of ${countLabel(row.txCount)} txns`;
}

function SplitCell({ row }: { row: ProtocolRankingDto }) {
  return (
    <span className="flex min-w-32 flex-col gap-1" title={splitTitle(row)}>
      <span className="whitespace-nowrap font-mono text-xs text-text-secondary">
        {countLabel(row.swapTxCount)} swap
        <span className="text-text-muted"> · </span>
        {countLabel(row.bridgeTxCount)} bridge
      </span>
      <svg
        className="h-1 w-full"
        viewBox={`0 0 ${FULL_BAR} 4`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <rect
          x="0"
          y="0"
          width={FULL_BAR}
          height="4"
          rx="2"
          fill="currentColor"
          fillOpacity="0.18"
        />
        <rect
          x="0"
          y="0"
          width={swapBarWidth(row)}
          height="4"
          rx="2"
          fill="currentColor"
          fillOpacity="0.65"
        />
      </svg>
    </span>
  );
}

export function ProtocolsRankingTable({
  protocols,
  emptyMessage,
}: {
  protocols: ProtocolRankingDto[];
  emptyMessage: string;
}) {
  if (protocols.length === 0) {
    return <EmptyPanel message={emptyMessage} />;
  }
  return (
    <div className="glass overflow-x-auto">
      <table className="dimension-table">
        <thead>
          <tr>
            <th className="table-head font-normal">#</th>
            <th className="table-head font-normal">Protocol</th>
            <th className="table-head font-normal">Observed volume</th>
            <th className="table-head font-normal">Txns</th>
            <th className="table-head font-normal">Chains</th>
            <th className="table-head font-normal">Swap / bridge split</th>
          </tr>
        </thead>
        <tbody>
          {protocols.map((row, index) => (
            <tr key={row.protocol}>
              <td className="font-mono text-xs text-text-muted">{index + 1}</td>
              <td className="text-text-primary">
                <ProtocolBadge protocol={row.protocol} withName />
              </td>
              <td
                className="whitespace-nowrap font-mono text-text-primary"
                title={`$${formatUsdEstimate(row.volumeUsd)}`}
              >
                ${formatUsdCompact(row.volumeUsd)}
                <span className="ml-1 text-xs text-text-muted">est.</span>
              </td>
              <td className="font-mono text-xs text-text-secondary">{countLabel(row.txCount)}</td>
              <td className="font-mono text-xs text-text-secondary">{countLabel(row.chainCount)}</td>
              <td>
                <SplitCell row={row} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
