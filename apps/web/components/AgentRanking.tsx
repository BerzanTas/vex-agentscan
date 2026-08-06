import type { AgentStatDto } from "../lib/api";
import { RankingList } from "./RankingList";

export function AgentRanking({ agents }: { agents: AgentStatDto[] }) {
  return (
    <RankingList
      gradientPrefix="cobalt-agent-bar"
      emptyMessage="No verified activity yet"
      rows={agents.map((entry) => ({
        key: entry.alias,
        label: <span className="font-mono">{entry.alias}</span>,
        volumeUsd: entry.volumeUsd,
        txCount: entry.txCount,
      }))}
    />
  );
}
