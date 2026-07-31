import type { ReactNode } from "react";
import { formatUsdEstimate } from "../lib/format";

export type RankingRow = {
  key: string;
  label: ReactNode;
  volumeUsd: string;
  txCount: number;
};

const COLUMNS = "grid grid-cols-[1.25rem_minmax(0,1fr)_auto_4rem] items-baseline gap-x-3";

function barWidthOf(volumeUsd: string, maxVolume: number): number {
  if (maxVolume <= 0) return 0;
  return Math.max(2, (Number(volumeUsd) / maxVolume) * 100);
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
    <div className="flex flex-col gap-3">
      <div className={`${COLUMNS} text-xs tracking-wide text-text-muted`}>
        <span />
        <span />
        <span className="text-right">Volume</span>
        <span className="border-l border-white/8 pl-3 text-right">Tx</span>
      </div>
      <ol className="flex flex-col gap-4">
        {rows.map((row, index) => (
          <li key={row.key} className="flex flex-col gap-1.5">
            <div className={COLUMNS}>
              <span className="text-right font-mono text-xs text-text-muted">{index + 1}</span>
              <span className="min-w-0 truncate text-sm text-text-secondary">{row.label}</span>
              <span className="whitespace-nowrap text-right font-mono text-sm text-text-primary">
                ${formatUsdEstimate(row.volumeUsd)}
                <span className="ml-1 text-xs text-text-muted">est.</span>
              </span>
              <span className="border-l border-white/8 pl-3 text-right font-mono text-xs text-text-muted">
                {row.txCount.toLocaleString("en-US")}
              </span>
            </div>
            <svg
              className="h-1.5 w-full"
              viewBox="0 0 100 6"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id={`${gradientPrefix}-${index}`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#1f44ff" />
                  <stop offset="100%" stopColor="#0a23b8" />
                </linearGradient>
              </defs>
              <rect
                x="0"
                y="0"
                height="6"
                rx="3"
                width={barWidthOf(row.volumeUsd, maxVolume)}
                fill={`url(#${gradientPrefix}-${index})`}
              />
            </svg>
          </li>
        ))}
      </ol>
    </div>
  );
}
