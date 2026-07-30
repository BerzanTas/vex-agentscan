import type { ProtocolStatDto } from "../lib/api";
import { formatUsdEstimate } from "../lib/format";
import { ProtocolBadge } from "./ProtocolBadge";

function barWidthOf(volumeUsd: string, maxVolume: number): number {
  if (maxVolume <= 0) return 0;
  return Math.max(2, (Number(volumeUsd) / maxVolume) * 100);
}

export function ProtocolRanking({ protocols }: { protocols: ProtocolStatDto[] }) {
  if (protocols.length === 0) {
    return <p className="text-sm text-text-muted">No protocols yet</p>;
  }
  const maxVolume = Math.max(...protocols.map((entry) => Number(entry.volumeUsd)));
  return (
    <ol className="flex flex-col gap-4">
      {protocols.map((entry, index) => (
        <li key={entry.protocol} className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-3">
            <span className="w-4 text-right font-mono text-xs text-text-muted">{index + 1}</span>
            <span className="flex-1 text-sm text-text-secondary">
              <ProtocolBadge protocol={entry.protocol} />
            </span>
            <span className="font-mono text-sm text-text-primary">
              ${formatUsdEstimate(entry.volumeUsd)}
              <span className="ml-1 text-xs text-text-muted">est.</span>
            </span>
            <span className="w-14 text-right font-mono text-xs text-text-muted">
              {entry.txCount.toLocaleString("en-US")} tx
            </span>
          </div>
          <svg
            className="h-1.5 w-full"
            viewBox="0 0 100 6"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={`cobalt-bar-${index}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#1f44ff" />
                <stop offset="100%" stopColor="#0a23b8" />
              </linearGradient>
            </defs>
            <rect
              x="0"
              y="0"
              height="6"
              rx="3"
              width={barWidthOf(entry.volumeUsd, maxVolume)}
              fill={`url(#cobalt-bar-${index})`}
            />
          </svg>
        </li>
      ))}
    </ol>
  );
}
