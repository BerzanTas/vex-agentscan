import type { ProtocolStatDto } from "../lib/api";
import { formatUsdEstimate } from "../lib/format";

export function ProtocolRanking({ protocols }: { protocols: ProtocolStatDto[] }) {
  if (protocols.length === 0) {
    return <p className="text-sm text-text-muted">No protocols yet</p>;
  }
  return (
    <ol className="flex flex-col gap-2">
      {protocols.map((entry, index) => (
        <li
          key={entry.protocol}
          className="flex items-center gap-3 rounded-md border border-bg-overlay bg-bg-elevated px-3 py-2"
        >
          <span className="w-5 text-right font-mono text-xs text-text-muted">{index + 1}</span>
          <span className="flex-1 text-sm text-text-secondary">{entry.protocol}</span>
          <span className="font-mono text-sm text-text-primary">
            ${formatUsdEstimate(entry.volumeUsd)}
            <span className="ml-1 text-xs text-text-muted">est.</span>
          </span>
          <span className="w-16 text-right font-mono text-xs text-text-muted">
            {entry.txCount.toLocaleString("en-US")} tx
          </span>
        </li>
      ))}
    </ol>
  );
}
