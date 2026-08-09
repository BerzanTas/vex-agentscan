import type { ReactNode } from "react";
import { formatUsdCompact, formatUsdEstimate } from "../lib/format";
import { EmptyPanel } from "./EmptyPanel";

export type AgentPageBreakdownRow = {
  key: string;
  label: ReactNode;
  volumeUsd: string;
  txCount: number;
};

export function AgentPageBreakdownTable({
  dimension,
  rows,
  emptyMessage,
}: {
  dimension: string;
  rows: AgentPageBreakdownRow[];
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <EmptyPanel message={emptyMessage} withLiveDot={false} />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="dimension-table">
        <thead>
          <tr>
            <th className="table-head font-normal">#</th>
            <th className="table-head font-normal">{dimension}</th>
            <th className="table-head font-normal">Observed volume</th>
            <th className="table-head font-normal">Txns</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.key}>
              <td className="font-mono text-xs text-text-muted">{index + 1}</td>
              <td className="text-text-primary">{row.label}</td>
              <td
                className="whitespace-nowrap font-mono text-text-primary"
                title={`$${formatUsdEstimate(row.volumeUsd)}`}
              >
                ${formatUsdCompact(row.volumeUsd)}
                <span className="ml-1 text-xs text-text-muted">est.</span>
              </td>
              <td className="font-mono text-xs text-text-secondary">
                {row.txCount.toLocaleString("en-US")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
