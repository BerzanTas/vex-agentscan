import type { ReactNode } from "react";
import { formatUsdCompact, formatUsdAmount } from "../lib/format";

export type RankingRow = {
  key: string;
  label: ReactNode;
  volumeUsd: string;
  txCount: number;
};

const MIN_BAR_PERCENT = 3;

function barPercentOf(volumeUsd: string, maxVolume: number): number {
  if (maxVolume <= 0) return 0;
  return Math.max(MIN_BAR_PERCENT, (Number(volumeUsd) / maxVolume) * 100);
}

export function RankingList({
  rows,
  emptyMessage,
  gradientPrefix,
}: {
  rows: RankingRow[];
  emptyMessage: string;
  gradientPrefix: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-text-muted">{emptyMessage}</p>;
  }
  const maxVolume = Math.max(...rows.map((row) => Number(row.volumeUsd)));
  return (
    <div className="flex flex-col gap-4">
      <div className="table-head flex items-baseline justify-end gap-6">
        <span>Volume</span>
        <span className="w-12 text-right">Tx</span>
      </div>
      <ol className="flex flex-col gap-4">
        {rows.map((row, index) => (
          <li key={row.key} className="ranking-row">
            <div className="flex items-baseline gap-3">
              <span className="w-4 shrink-0 text-right font-mono text-xs text-text-muted">
                {index + 1}
              </span>
              <span className="ranking-label min-w-0 flex-1">{row.label}</span>
              <span
                className="whitespace-nowrap font-mono text-sm text-text-primary"
                title={`$${formatUsdAmount(row.volumeUsd)}`}
              >
                ${formatUsdCompact(row.volumeUsd)}
              </span>
              <span className="w-12 whitespace-nowrap text-right font-mono text-xs text-text-muted">
                {row.txCount.toLocaleString("en-US")}
              </span>
            </div>
            <svg
              className="h-1 w-full"
              viewBox="0 0 100 4"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id={`${gradientPrefix}-fill`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#1f44ff" />
                  <stop offset="100%" stopColor="#7f96ff" />
                </linearGradient>
              </defs>
              <rect x="0" y="0" width="100" height="4" rx="2" fill="rgba(31,68,255,0.16)" />
              <rect
                x="0"
                y="0"
                height="4"
                rx="2"
                width={barPercentOf(row.volumeUsd, maxVolume)}
                fill={`url(#${gradientPrefix}-fill)`}
              />
            </svg>
          </li>
        ))}
      </ol>
    </div>
  );
}
